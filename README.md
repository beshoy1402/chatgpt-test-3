# Zahrat Elmadina Restaurant & Cafe

Complete restaurant ordering/admin website based on the supplied project files and customized for:

**Zahrat Elmadina Restaurant & Cafe**  
**مطعم وكافيه زهرة المدينة**  
**Avenue Mall, Obour City, Egypt**

## Included

- Customer website
- Responsive mobile navigation / 3-dash menu
- English + Arabic RTL
- Menu search and category filtering
- Food cards, favorites and featured/popular items
- Cart and checkout
- Coupons / offers
- Reservations
- Dine-in table/NFC links
- Order tracking
- Google Reviews CTA
- Loyalty points and configurable rewards
- Simple loyalty rewards (discounts, free add-ons, free delivery)
- Percentage/fixed discount rewards
- Free add-on / free delivery / custom reward types
- Admin dashboard
- Categories with enable/disable
- Food availability and stock
- Modifiers/add-ons foundation
- Kitchen display
- Waiter mode
- Receipt Designer
- Restaurant branding/settings
- Analytics and customer feedback
- Firebase persistence
- Demo menu fallback for a fresh Firebase database

## Files

- `index.html` — customer website
- `app.js` — customer application logic
- `db.js` — Firebase/data layer and restaurant defaults
- `admin.html` / `admin.js` — admin dashboard
- `kitchen.html` — kitchen display
- `waiter.html` — waiter mode
- `firestore.rules` — prototype-compatible rules
- `SETUP.md` — Firebase setup
- `DEPLOYMENT.md` — deployment checklist
- `PRODUCTION_SECURITY.md` — production security requirements
- `FINAL_BUILD.md` — feature summary

## Important production note

The supplied project uses a frontend-heavy architecture. Before real restaurant use, move administrator authentication/authorization, secrets, order totals, inventory, loyalty redemption and other trusted business rules to a secure server-side layer/Firebase Cloud Functions as appropriate.
