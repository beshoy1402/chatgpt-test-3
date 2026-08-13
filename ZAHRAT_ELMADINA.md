# Zahrat Elmadina Restaurant & Cafe — Customized Base

This package is based on the supplied restaurant website files and keeps the existing customer, admin, kitchen, waiter, Firebase, ordering, reservation, loyalty, landing tutorials, and receipt functionality.

## Branding
- English: Zahrat Elmadina Restaurant & Cafe
- Arabic: مطعم وكافيه زهرة المدينة
- Location: Avenue Mall, Obour City, Egypt
- Tagline: Authentic flavors, warm moments.
- Currency: ج.م

## Important
The Firebase project/configuration in `db.js` is inherited from the supplied files. Before production use, connect the site to the restaurant's own Firebase project and configure Authentication/Firestore rules securely.

The frontend admin login in the supplied architecture is not production-grade authentication. Move admin authorization server-side before exposing the admin dashboard publicly.
