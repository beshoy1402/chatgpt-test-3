# 🔥 Zahrat Elmadina Restaurant & Cafe — Firebase Setup (5 minutes)

## Step 1 — Create Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"** → name it `zahrat-elmadina` → Continue
3. Disable Google Analytics (not needed) → **Create project**

## Step 2 — Enable Firestore

1. In left sidebar → **Firestore Database** → **Create database**
2. Choose **"Start in test mode"** → Next
3. Pick any location (closest to Egypt: `europe-west1`) → **Enable**

## Step 3 — Get Your Config

1. Click the ⚙️ gear icon → **Project settings**
2. Scroll to **"Your apps"** → Click **</>** (Web)
3. Register app name: `zahrat-elmadina` → **Register app**
4. Copy the `firebaseConfig` object — looks like:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "zahrat-elmadina-xxx.firebaseapp.com",
  projectId: "zahrat-elmadina-xxx",
  storageBucket: "zahrat-elmadina-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc123"
};
```

## Step 4 — Paste Config into db.js

Open **`db.js`** and replace the `FIREBASE_CONFIG` object at the top with your values.

## Step 5 — Seed Initial Data (optional)

In Firebase Console → Firestore → **Start collection**:

### Collection: `categories`
Add documents manually:
| Field | Value |
|-------|-------|
| name | Meals |
| name_ar | وجبات |
| icon | 🍽️ |
| sort_order | 1 |

### Collection: `settings` → Document ID: `main`
| Field | Value |
|-------|-------|
| currency_symbol | ج.م |
| wifi_name | Zahrat_Guest |
| wifi_pass | Ask staff for Wi-Fi password |
| site_url | https://YOUR-DOMAIN.com/index.html |

### Collection: `tables`
Add one doc per table:
| Field | Value |
|-------|-------|
| table_number | 1 |
| capacity | 4 |
| active | true |

## Step 6 — Deploy to GitHub Pages

Upload all files to your repo. No backend server needed — Firebase is serverless.

## Admin Login (prototype fallback)
- **Username:** `admin`
- **Password:** `admin123`

This fallback is for the supplied prototype only. Do not use it as production authentication. Use Firebase Authentication for the live restaurant admin.

## NFC Setup
Program each chip with: `https://YOUR-DOMAIN.com/index.html?table=5`


## Zahrat Elmadina default restaurant settings

Use these values in `settings/main` if you want the Firebase data to match the customized files:

- restaurant_name: `Zahrat Elmadina Restaurant & Cafe`
- restaurant_name_ar: `مطعم وكافيه زهرة المدينة`
- restaurant_icon: `🌿`
- tagline: `Authentic flavors, warm moments.`
- contact_address: `Avenue Mall, Obour City, Egypt`
- open_time: `10:00 AM`
- close_time: `12:00 AM`
- currency_symbol: `ج.م`
- wifi_name: `Zahrat_Guest`
- hero_title1: `Taste the heart of`
- hero_title2: `Zahrat Elmadina.`
- hero_subtitle: `A warm dining experience with delicious food, great coffee, and memorable moments.`
