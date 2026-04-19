# Requirements: Print Ninjaz

**Defined:** 2026-04-12
**Core Value:** Customers can easily browse and buy unique 3D printed products with a simple, clean shopping experience.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Product Catalog

- [ ] **PROD-01**: User can browse product catalog in a responsive grid layout
- [ ] **PROD-02**: User can view product detail page with multiple images, description, and pricing
- [ ] **PROD-03**: User can select size (Small/Medium/Large) with per-size pricing displayed
- [ ] **PROD-04**: User can view size guide with real physical dimensions per product
- [ ] **PROD-05**: User can see material information and "how it's made" explanation
- [ ] **PROD-06**: User can see lead time notice ("ships in 3-7 business days")

### Authentication

- [ ] **AUTH-01**: User can create account with email and password
- [ ] **AUTH-02**: User can log in and stay logged in across browser sessions
- [ ] **AUTH-03**: User can log out from any page
- [ ] **AUTH-04**: User can reset password via email link
- [ ] **AUTH-05**: User gives PDPA consent checkbox during registration

### Shopping Cart

- [ ] **CART-01**: User can add products to cart with selected size
- [ ] **CART-02**: User can view cart with line items showing name, size, quantity, and price
- [ ] **CART-03**: User can update quantity of items in cart
- [ ] **CART-04**: User can remove items from cart
- [ ] **CART-05**: User can see cart subtotal

### Checkout & Payment

- [ ] **PAY-01**: User can proceed from cart to checkout flow
- [ ] **PAY-02**: User can enter shipping address during checkout
- [ ] **PAY-03**: User can pay via PayPal in MYR currency
- [ ] **PAY-04**: User sees order confirmation page after successful payment
- [ ] **PAY-05**: User receives order confirmation email with order summary

### Orders

- [ ] **ORD-01**: User can view order history with status updates
- [ ] **ORD-02**: User can view individual order details

### Admin

- [ ] **ADM-01**: Admin can create products with name, description, multiple images, and per-size pricing (S/M/L)
- [ ] **ADM-02**: Admin can edit existing products
- [ ] **ADM-03**: Admin can delete products
- [ ] **ADM-04**: Admin can toggle products active/inactive
- [ ] **ADM-05**: Admin can view list of all orders with customer info
- [ ] **ADM-06**: Admin can update order status (pending → processing → shipped → delivered)
- [ ] **ADM-07**: Admin can view all customer accounts and suspend/unsuspend any non-admin user
- [ ] **ADM-08**: Admin can create, edit, and deactivate discount coupons (percentage or fixed MYR, min-spend, date range, usage cap)
- [ ] **ADM-09**: Admin can edit store settings (business name, contact details, WhatsApp number, socials, banner announcement) through a form without touching env vars
- [ ] **ADM-10**: Admin can view analytics dashboard (revenue, order count, top products, conversion funnel) for the last 7/30/90 days
- [ ] **ADM-11**: Admin can edit the HTML of transactional email templates (order confirmation, password reset) with live preview
- [ ] **ADM-12**: Admin can moderate customer reviews/ratings (approve, hide, delete) via moderation queue
- [ ] **ADM-13**: Admin can configure flat shipping rates per MY state, free-shipping threshold, and SST toggle (off for now but ready)
- [ ] **ADM-14**: Admin can import a CSV of products (name, description, category, S/M/L prices) and see a success/failure report
- [ ] **ADM-15**: Admin can toggle a product variant as in-stock/out-of-stock without deleting it

### Promotions

- [ ] **PROMO-01**: Customer can apply a coupon code at checkout and see discount line in summary
- [ ] **PROMO-02**: Coupon validation rules (min-spend, date range, usage cap, active flag) are enforced server-side at checkout

### Inventory

- [ ] **INV-01**: Product variant `in_stock` flag is visible on storefront (sold-out badge on card, disabled size button on detail)
- [ ] **INV-02**: Admin sees low-stock alert on product row when variant falls below `low_stock_threshold`

### Reviews (admin-side only in v1)

- [ ] **REV-01**: Admin can moderate reviews (approve/hide/delete) via `/admin/reviews` queue — schema ready for storefront submission UI in a future phase

### Shipping

- [ ] **SHIP-01**: Shipping cost on checkout is computed from admin-configured flat per-state rates, with free-shipping threshold applied when subtotal qualifies

### Settings

- [ ] **SETTINGS-01**: Store settings (business name, contact, WhatsApp, socials, banner announcement, free-ship threshold, SST toggle) are editable via `/admin/settings`, DB-backed with in-memory cache

### Reporting

- [ ] **REPORT-01**: Admin dashboard at `/admin` shows revenue, order count, top products, and conversion funnel for 7/30/90 day windows

### Trust & Brand

- [x] **BRAND-01**: Site uses Print Ninjaz branding (logo, ninja theme, green/blue/black colors)
- [x] **BRAND-02**: Site has About/Contact page with business information
- [x] **BRAND-03**: Site has privacy policy page (PDPA 2010 compliance)
- [x] **BRAND-04**: Site has WhatsApp contact link for customer queries
- [x] **BRAND-05**: Site uses ninja-themed brand copy throughout

### Responsive Design

- [x] **RESP-01**: All pages are mobile-responsive with thumb-friendly tap targets (44px min)
- [x] **RESP-02**: Pages load in under 2 seconds on mobile
- [x] **RESP-03**: No horizontal scroll on any viewport

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Local Payments

- **LPAY-01**: User can pay via FPX (Malaysian bank transfer)
- **LPAY-02**: User can pay via Touch 'n Go eWallet
- **LPAY-03**: User can pay via GrabPay

### AI Custom Generation (Milestone 2)

- **AI-01**: User can upload photo to generate custom 3D model via Meshy API
- **AI-02**: User can type description to generate custom 3D model
- **AI-03**: User can upload multiple images for better 3D model generation
- **AI-04**: User can preview generated 3D model before ordering

### Social Features

- **SOC-01**: User can leave reviews/ratings on products (storefront submission UI; admin moderation already shipped in Phase 5)
- **SOC-02**: User can add products to wishlist

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Guest checkout | Account enables order history, repeat tracking, milestone 2 personalization |
| 3D model viewer | High complexity, poor mobile perf, not needed for pre-made items |
| ~~Inventory tracking~~ | Phase 5 adds per-variant in_stock toggle + low-stock threshold (no quantity-level tracking) |
| Multi-language (Malay/Chinese) | Significant scope increase; Malaysian e-commerce operates in English |
| Live carrier shipping rates | Overcomplicates checkout; flat fee per state sufficient for domestic Malaysia |
| ~~Discount codes/promotions~~ | Phase 5 adds coupon mgmt + customer apply at checkout |
| Live chat | WhatsApp achieves same goal with zero backend |
| Social login (Google/Facebook) | Extra OAuth complexity for minimal conversion benefit at launch |
| Subscription/recurring orders | Irrelevant for made-to-order 3D printed goods |
| B2B/wholesale pricing | Out of scope for basic B2C store |
| Product comparison | Premature for small catalog |
| Returns management system | Handle manually via WhatsApp/email; document policy on static page |
| Customer-side review submission UI | Deferred to future phase (Phase 5 ships admin moderation + schema only) |
| Coupon stacking | One coupon per order in v1 |
| Shipping label printing / tracking numbers | Manual dispatch in v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROD-01 | Phase 2 | Pending |
| PROD-02 | Phase 2 | Pending |
| PROD-03 | Phase 2 | Pending |
| PROD-04 | Phase 2 | Pending |
| PROD-05 | Phase 2 | Pending |
| PROD-06 | Phase 2 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| CART-01 | Phase 2 | Pending |
| CART-02 | Phase 2 | Pending |
| CART-03 | Phase 2 | Pending |
| CART-04 | Phase 2 | Pending |
| CART-05 | Phase 2 | Pending |
| PAY-01 | Phase 3 | Pending |
| PAY-02 | Phase 3 | Pending |
| PAY-03 | Phase 3 | Pending |
| PAY-04 | Phase 3 | Pending |
| PAY-05 | Phase 3 | Pending |
| ORD-01 | Phase 3 | Pending |
| ORD-02 | Phase 3 | Pending |
| ADM-01 | Phase 1 | Pending |
| ADM-02 | Phase 1 | Pending |
| ADM-03 | Phase 1 | Pending |
| ADM-04 | Phase 1 | Pending |
| ADM-05 | Phase 3 | Pending |
| ADM-06 | Phase 3 | Pending |
| ADM-07 | Phase 5 | Pending |
| ADM-08 | Phase 5 | Pending |
| ADM-09 | Phase 5 | Pending |
| ADM-10 | Phase 5 | Pending |
| ADM-11 | Phase 5 | Pending |
| ADM-12 | Phase 5 | Pending |
| ADM-13 | Phase 5 | Pending |
| ADM-14 | Phase 5 | Pending |
| ADM-15 | Phase 5 | Pending |
| PROMO-01 | Phase 5 | Pending |
| PROMO-02 | Phase 5 | Pending |
| INV-01 | Phase 5 | Pending |
| INV-02 | Phase 5 | Pending |
| REV-01 | Phase 5 | Pending |
| SHIP-01 | Phase 5 | Pending |
| SETTINGS-01 | Phase 5 | Pending |
| REPORT-01 | Phase 5 | Pending |
| BRAND-01 | Phase 4 | Complete |
| BRAND-02 | Phase 4 | Complete |
| BRAND-03 | Phase 4 | Complete |
| BRAND-04 | Phase 4 | Complete |
| BRAND-05 | Phase 4 | Complete |
| RESP-01 | Phase 4 | Complete |
| RESP-02 | Phase 4 | Complete |
| RESP-03 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 54 total (37 original + 17 Phase 5 additions)
- Mapped to phases: 54
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-16 — Phase 5 requirements added (ADM-07..15, PROMO, INV, REV, SHIP, SETTINGS, REPORT)*
