# Production Security Notes — Zahrat Elmadina Restaurant & Cafe

This project is a static/client-heavy prototype with Firebase integration. Before production:

1. Move administrator authentication to Firebase Authentication (email/password or another supported provider).
2. Remove any demo/fallback admin credential from client-side JavaScript.
3. Replace the current permissive Firestore rules with role-based rules. Customers should only be able to create the specific customer records they need; admin/staff writes must require an admin/staff claim.
4. Do not store Anthropic API keys or other secret API keys in browser JavaScript. Use a server-side function/proxy.
5. Validate loyalty redemption, order totals, discounts, inventory, and reservation availability server-side.
6. Validate and size-limit uploaded logos/images. Prefer Firebase Storage with controlled access instead of storing large base64 blobs in settings.
7. Review all WhatsApp/third-party API credentials and keep them server-side.

The supplied `firestore.rules` is intentionally kept compatible with the current prototype. It is NOT a production security policy.
