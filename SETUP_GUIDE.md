
# 🚀 Complete Setup Guide — Student-Admin Chat System

## ⚙️ Architecture
```
MongoDB Atlas ←→ Node.js Backend (Render) ←→ Socket.io
                          ↑                        ↑
               Student Web (Vercel)      Admin App (APK)
```

---

## 📦 STEP 1: MongoDB Atlas Setup

1. Go to https://cloud.mongodb.com and create a free account
2. Create a new **Cluster** (free tier M0)
3. Under **Database Access** → Add user with username + password
4. Under **Network Access** → Add IP: `0.0.0.0/0` (allow all)
5. Click **Connect** → **Connect your application** → Copy the URI:
   ```
mongodb+srv://praveenseenu629:praveens@cluster0.kirgymr.mongodb.net/?appName=Cluster0
   ```

---

## 🖥️ STEP 2: Deploy Backend to Render

1. Push the `backend/` folder to a GitHub repository
2. Go to https://render.com → New → **Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: `Node`
5. Add **Environment Variables**:
   ```
   PORT=5000
   MONGODB_URI=mongodb+srv://...your connection string...
   BACKEND_URL=https://YOUR-APP-NAME.onrender.com
   ```
6. Deploy and note your URL: `https://YOUR-APP-NAME.onrender.com`
7. Test: Visit `https://YOUR-APP-NAME.onrender.com/api/health`

---

## 🌐 STEP 3: Deploy Student Web to Vercel

1. Push the `student-web/` folder to GitHub
2. Go to https://vercel.com → New Project
3. Import your repo
4. Add **Environment Variable**:
   ```
   REACT_APP_BACKEND_URL=https://YOUR-APP-NAME.onrender.com
   ```
5. Deploy → you'll get a URL like `https://your-chat.vercel.app`

---

## 📱 STEP 4: Build Admin APK

### Option A: EAS Build (Recommended - No setup needed)

```bash
cd admin-app
npm install
npm install -g eas-cli
eas login
eas build:configure
```

Edit `.env` or `config.js`:
```js
// admin-app/config.js
export const BACKEND_URL = 'https://YOUR-APP-NAME.onrender.com';
```

Build APK:
```bash
eas build --platform android --profile preview
```
Download the APK from the EAS dashboard.

### Option B: Expo Go (For Testing)

```bash
cd admin-app
npm install
npx expo start
```
Scan QR code with Expo Go app.

⚠️ **IMPORTANT**: Change the `BACKEND_URL` in `admin-app/config.js` to your actual Render URL BEFORE building!

---

## 🧪 STEP 5: Test the System

1. **Backend**: Visit `https://your-app.onrender.com/api/health` → should return `{"status":"ok"}`
2. **Student Web**: Open your Vercel URL → enter name → start chatting
3. **Admin App**: Open APK → you should see students appear → tap to chat

---

## 🔧 Common Fixes

### ❌ "Connection Error - Could not connect to server"
- Make sure `config.js` in admin-app has the **correct Render URL**
- The URL must be `https://` not `http://`
- Check if backend is awake (Render free tier sleeps — visit the health URL first)

### ❌ Backend is slow to respond
- Render free tier sleeps after 15 min of inactivity
- First request takes 30-60 seconds to wake up
- Consider upgrading to paid tier or using Railway

### ❌ CORS error in browser
- Backend already has `cors({ origin: '*' })` — should work for all origins

### ❌ File upload not working
- Check `BACKEND_URL` env variable is set correctly
- Max file size is 50MB

---

## 📁 Folder Structure
```
chat-system/
├── backend/               ← Node.js + Express + Socket.io
│   ├── server.js
│   ├── uploads/           ← File storage (auto-created)
│   ├── package.json
│   └── .env.example
├── student-web/           ← React web app
│   ├── src/
│   │   ├── App.js
│   │   └── components/
│   ├── public/
│   └── package.json
├── admin-app/             ← React Native Expo
│   ├── App.js
│   ├── screens/
│   ├── utils/
│   ├── config.js          ← ⚠️ SET YOUR BACKEND URL HERE
│   └── package.json
└── SETUP_GUIDE.md         ← This file
```

---

## 🔔 Push Notifications (Optional)

For push notifications in the admin app:
1. Go to https://expo.dev → your project → Credentials
2. Setup FCM for Android
3. Use `expo-notifications` (already installed) with Expo Push Token

---

## 💡 Environment Variables Summary

| Service | Variable | Value |
|---------|----------|-------|
| Backend | `MONGODB_URI` | Your Atlas connection string |
| Backend | `BACKEND_URL` | Your Render URL |
| Student Web | `REACT_APP_BACKEND_URL` | Your Render URL |
| Admin App | `config.js` → `BACKEND_URL` | Your Render URL |
