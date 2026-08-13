# Deployment — Zahrat Elmadina Restaurant & Cafe

## GitHub Pages

1. Upload the contents of this folder to the repository that serves the customer site.
2. Ensure `index.html` is at the published root.
3. Open the GitHub Pages URL.
4. The site uses Firebase from `db.js` for persistent menu, orders, reservations, loyalty and settings.

## Firebase

Before production, use a Firebase project owned by Zahrat Elmadina. Replace `FIREBASE_CONFIG` in `db.js` with the restaurant project's web app configuration.

Enable:
- Firestore
- Authentication → Anonymous (customer flow)
- Authentication → Email/Password (admin/staff accounts)

Deploy `firestore.rules` only after reviewing it. The supplied rules are compatible with the prototype but are intentionally not a production authorization policy.

## Admin

Open `admin.html`. The project supports the existing prototype login plus Firebase authentication. For production, remove the client-side fallback credential and require Firebase Authentication with admin/staff authorization claims.

## NFC / QR table links

Use:
`https://YOUR-DOMAIN/index.html?table=5`

Replace `5` with the actual table number. The customer site no longer invents a table number when no table parameter is present.

## Logo

Use Admin → Settings → Restaurant Logo. The saved logo is used by the customer header and receipt designer.

## Google Reviews

Use Admin → Settings → Google Reviews and enter the restaurant's real Google review URL. Do not use a placeholder URL in production.
