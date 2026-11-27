# Omnicademy: poora setup (shuru se)

Is zip mein:
- index.html : poori website (Firebase config pehle se bhari hui)
- firestore.rules : database ke rules
- storage.rules : file upload ke rules
- firebase.json, .vercelignore : deploy ke liye

## 1. Firebase console (ek baar)
1. **Authentication > Sign-in method > Email/Password** ko Enable karo.
2. **Firestore Database**: agar database nahi hai to Create database dabao. Database ID `(default)` rakho. (Agar pehle se `default` naam ka database hai to wo bhi chalega, site dono check karti hai.)
3. Firestore ke **Rules** tab mein saara purana code hata do. firestore.rules ka poora code paste karo aur **Publish** dabao.
4. (PDF upload chahiye to) **Storage** > Get started. Phir Storage ke Rules mein storage.rules paste karke Publish karo.
5. **Authentication > Settings > Authorized domains** mein apni Vercel site ka domain jodo (https:// ke bina).

## 2. Vercel par deploy
Is folder ko unzip karo. Terminal mein folder ke andar: `npm install -g vercel`, phir `vercel --prod`.
Ya GitHub par daal kar vercel.com/new se Import karo (Framework: Other).

## 3. Pehla admin banao
1. Site par Menu > Student Login / Sign Up se account banao.
2. Menu > Admin Login dabao. Ek box aayega jisme aapki ID hai.
3. Firestore > Start collection > Collection ID `admins` > Document ID: wahi ID > koi ek field (ok = true) > Save.
4. "I added it, check again" dabao. Admin Dashboard khul jayega.

## Agar kuch na chale
Admin Login ke box mein "Result:" wali line padho. Wo batati hai ki database mila ya nahi, rules publish hue ya nahi, ya browser (Brave Shields / ad-blocker) connection rok raha hai. Brave mein sher (lion) icon dabakar is site ke liye Shields off karke dekho.

## Dhyan rakhne wali baatein
- Password Firebase Authentication sambhalta hai, database mein save nahi hota.
- Students ka email aur district sirf admins dekh sakte hain. Doubts par naam aur class dikhti hai.
- Students minors ho sakte hain, school/mentors se permission le lena theek rahega.
- Storage naye projects mein Blaze (pay-as-you-go) plan maang sakta hai.

## AI Tutor (Groq)
Ask Doubt ka AI tutor Groq se chalta hai. API key site mein nahi, Vercel ke server function (`api/tutor.js`) mein rehti hai.
1. console.groq.com se API key banao. Use kisi ko mat do aur kahin public mat likho.
2. Vercel > aapka project > Settings > Environment Variables mein ye daalo:
   - `GROQ_API_KEY` = aapki Groq key (zaroori)
   - `FIREBASE_PROJECT_ID` = `omnicademy`
   - `DAILY_LIMIT` = `10` (har student ke roz ke sawaal, max 30)
   - `GROQ_MODEL` = (optional) Groq Console ke Models page se koi chalta hua model. Na daalo to `llama-3.3-70b-versatile` use hoga.
   - `FIRESTORE_DB_ID` = (optional) sirf tab jab aapka database `(default)` naam ka nahi hai
3. **firestore.rules** dobara Firestore ke Rules mein paste karke Publish karo (isme nayi `usage` rules hain, jinse roz ki limit chalti hai).
4. Redeploy karo (env variables badalne ke baad zaroori hai).
5. Test: site kholo > login karo > Ask Doubt mein sawaal poochho. `https://aapki-site/api/tutor` kholne par `{"ok":true,...}` dikhna chahiye.
Zaroori: `api` folder GitHub mein bhi upload hona chahiye (api/tutor.js).
