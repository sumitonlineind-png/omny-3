// Omnicademy AI Tutor (Groq). The Groq key stays on the server (Vercel environment variable).
// Needs: GROQ_API_KEY. Optional: FIREBASE_PROJECT_ID (default "omnicademy"), FIRESTORE_DB_ID,
// DAILY_LIMIT (default 10, max 30), GROQ_MODEL.
const PROJECT = process.env.FIREBASE_PROJECT_ID || "omnicademy";
const LIMIT = Math.min(parseInt(process.env.DAILY_LIMIT || "10", 10) || 10, 30);
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const FS = "https://firestore.googleapis.com/v1/projects/";
let dbCache = process.env.FIRESTORE_DB_ID || null;

const LANGS = {
  "English": "simple English",
  "हिन्दी": "simple Hindi in Devanagari script (common English technical words are fine)",
  "Hinglish": "Hinglish: Hindi written in Roman letters, mixed with common English words"
};

async function pickDb() {
  if (dbCache) return dbCache;
  for (const id of ["(default)", "default"]) {
    try {
      const r = await fetch(`${FS}${PROJECT}/databases/${encodeURIComponent(id)}/documents/usage/healthcheck`);
      if (r.status !== 404) { dbCache = id; return id; }
    } catch (e) {}
  }
  return "(default)";
}

function decode(tok) {
  try {
    const p = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString("utf8"));
    if (p.aud !== PROJECT || (p.exp && p.exp * 1000 < Date.now())) return null;
    return p.user_id || p.sub || null;
  } catch (e) { return null; }
}

const dayKey = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India date

async function getN(db, id, tok) {
  const r = await fetch(`${FS}${PROJECT}/databases/${encodeURIComponent(db)}/documents/usage/${id}`, { headers: { Authorization: "Bearer " + tok } });
  if (r.status === 404) return 0;
  if (r.status === 401) throw { status: 401 };
  if (!r.ok) throw { status: 503 };
  const j = await r.json();
  return parseInt((j.fields && j.fields.n && j.fields.n.integerValue) || "0", 10);
}

async function bump(db, id, tok, n) {
  const base = `${FS}${PROJECT}/databases/${encodeURIComponent(db)}/documents/usage`;
  const h = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
  const body = JSON.stringify({ fields: { n: { integerValue: String(n + 1) } } });
  const r = n === 0
    ? await fetch(`${base}?documentId=${id}`, { method: "POST", headers: h, body })
    : await fetch(`${base}/${id}?updateMask.fieldPaths=n`, { method: "PATCH", headers: h, body });
  return r.ok;
}

async function groq(messages, json) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const body = { model: MODEL, messages, temperature: 0.3, max_tokens: 1000 };
    if (json) body.response_format = { type: "json_object" };
    return await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
  } finally { clearTimeout(t); }
}

function parse(text) {
  let o = null;
  try { o = JSON.parse(text); } catch (e) {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) { try { o = JSON.parse(m[0]); } catch (e2) {} }
  }
  if (!o || typeof o !== "object") return { t: "Answer", s: [], f: String(text).slice(0, 1200), tip: "", more: [] };
  const arr = a => Array.isArray(a) ? a.map(x => String(x).slice(0, 500)).slice(0, 8) : [];
  return { t: String(o.topic || "Answer").slice(0, 80), s: arr(o.steps), f: String(o.final || "").slice(0, 500), tip: String(o.tip || "").slice(0, 400), more: arr(o.more).slice(0, 3) };
}

function system(lang) {
  return `You are Saathi, Omnicademy's friendly AI study partner for government school students in Haryana, India, preparing for Mission Buniyaad and Haryana Super 100 (classes 9 to 12). Reply in ${LANGS[lang] || LANGS["Hinglish"]}.
Explain step by step in simple words a school student can follow. Use only correct, reliable maths and science rules. If you are not sure, say so and tell the student to ask a teacher.
If the student only greets you (for example "hello"), greet back warmly in one short line and ask which subject or topic they need help with (leave "steps" empty). If the question is not about studies, politely say you can only help with studies (leave "steps" empty).
Never ask for or repeat personal details such as name, phone number or address. Keep the answer short and age-appropriate.
Reply ONLY with JSON in exactly this shape: {"topic":"short topic name","steps":["step 1","step 2"],"final":"the final answer in one line","tip":"one short shortcut or common mistake to avoid","more":["a similar practice question","another practice question"]}`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ ok: !!process.env.GROQ_API_KEY, limit: LIMIT, model: MODEL, db: dbCache || "auto" });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: "setup", message: "The AI Tutor is not set up yet." });

  const tok = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const uid = tok && decode(tok);
  if (!uid) return res.status(401).json({ error: "login", message: "Please sign in to use the AI Tutor." });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const q = String(b.q || "").trim().slice(0, 1500);
  if (!q) return res.status(400).json({ error: "empty", message: "Please type your doubt." });

  try {
    const db = await pickDb();
    const id = `${uid}_${dayKey()}`;
    const n = await getN(db, id, tok);
    if (n >= LIMIT) return res.status(429).json({ error: "daily", message: `You have used all ${LIMIT} free doubts for today. Please come back tomorrow.` });

    const hist = (Array.isArray(b.history) ? b.history : []).slice(-6)
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role, content: String(m.content || "").slice(0, 1200) }));
    const ctx = `Student: ${String(b.cls || "").slice(0, 20)}, ${String(b.prog || "").slice(0, 40)}. Subject: ${String(b.subject || "All").slice(0, 30)}.`;
    const msgs = [{ role: "system", content: system(b.lang) }, ...hist, { role: "user", content: `${ctx}\nQuestion: ${q}` }];

    let r = await groq(msgs, true);
    if (r.status === 400) r = await groq(msgs, false);
    if (r.status === 429) return res.status(429).json({ error: "busy", message: "The AI Tutor is very busy right now. Please try again in a minute, or ask in the Doubt Forum." });
    if (!r.ok) {
      console.error("Groq error", r.status, (await r.text()).slice(0, 300));
      return res.status(502).json({ error: "upstream", message: "Could not get an answer right now. Please try again, or ask in the Doubt Forum." });
    }
    const j = await r.json();
    const answer = parse((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "");
    const ok = await bump(db, id, tok, n).catch(() => false);
    if (!ok) console.error("usage counter not saved: publish the latest firestore.rules");
    return res.status(200).json({ answer, left: Math.max(0, LIMIT - (n + 1)) });
  } catch (e) {
    if (e && e.status === 401) return res.status(401).json({ error: "login", message: "Please sign in again." });
    if (e && e.status === 503) return res.status(503).json({ error: "rules", message: "The AI Tutor is not fully set up yet. Please ask the admin." });
    console.error(e);
    return res.status(502).json({ error: "upstream", message: "Could not get an answer right now. Please try again, or ask in the Doubt Forum." });
  }
};
