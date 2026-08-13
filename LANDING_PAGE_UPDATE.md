# Landing Page Update

## Customer website
- Hero primary CTA: Order Now
- Hero secondary CTA: Book a Table
- Added “See How It Works” tutorial cards for ordering and reservations.
- Each tutorial supports an animated template or an uploaded video.
- Tutorials open in a larger modal when the customer taps Watch Guide.
- Mobile-responsive animation cards are included.

## Developer Control Panel
Added **Landing Page & Tutorial Videos** with separate controls for Order Now and Book a Table:
- Animated Template
- Uploaded Video
- Hide Tutorial
- Multiple built-in templates for each flow
- Preview controls
- Firebase Storage upload for uploaded videos
- Show/hide landing tutorial cards

## Loyalty simplification
Removed the old free-meal/punch-card reward path. The owner-facing reward builder now offers only:
- Percentage Discount
- Fixed Discount
- Free Add-on
- Free Delivery

The owner workflow remains intentionally short, with advanced conditions kept optional.

## Important production note
Firebase Storage rules and authenticated admin authorization should be hardened before production. The current project remains frontend-heavy as documented in PRODUCTION_SECURITY.md.
