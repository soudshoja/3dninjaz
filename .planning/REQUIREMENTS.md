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

### Trust & Brand

- [ ] **BRAND-01**: Site uses Print Ninjaz branding (logo, ninja theme, green/blue/black colors)
- [ ] **BRAND-02**: Site has About/Contact page with business information
- [ ] **BRAND-03**: Site has privacy policy page (PDPA 2010 compliance)
- [ ] **BRAND-04**: Site has WhatsApp contact link for customer queries
- [ ] **BRAND-05**: Site uses ninja-themed brand copy throughout

### Responsive Design

- [ ] **RESP-01**: All pages are mobile-responsive with thumb-friendly tap targets (44px min)
- [ ] **RESP-02**: Pages load in under 2 seconds on mobile
- [ ] **RESP-03**: No horizontal scroll on any viewport

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

- **SOC-01**: User can leave reviews/ratings on products
- **SOC-02**: User can add products to wishlist

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Guest checkout | Account enables order history, repeat tracking, milestone 2 personalization |
| 3D model viewer | High complexity, poor mobile perf, not needed for pre-made items |
| Inventory tracking | Manual management fine at low volume; admin toggles active/inactive |
| Multi-language (Malay/Chinese) | Significant scope increase; Malaysian e-commerce operates in English |
| Live carrier shipping rates | Overcomplicates checkout; flat fee sufficient for domestic Malaysia |
| Discount codes/promotions | Non-essential for launch; add when first campaign requires it |
| Live chat | WhatsApp achieves same goal with zero backend |
| Social login (Google/Facebook) | Extra OAuth complexity for minimal conversion benefit at launch |
| Subscription/recurring orders | Irrelevant for made-to-order 3D printed goods |
| B2B/wholesale pricing | Out of scope for basic B2C store |
| Product comparison | Premature for small catalog |
| Returns management system | Handle manually via WhatsApp/email; document policy on static page |

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
| BRAND-01 | Phase 4 | Pending |
| BRAND-02 | Phase 4 | Pending |
| BRAND-03 | Phase 4 | Pending |
| BRAND-04 | Phase 4 | Pending |
| BRAND-05 | Phase 4 | Pending |
| RESP-01 | Phase 4 | Pending |
| RESP-02 | Phase 4 | Pending |
| RESP-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after roadmap creation*
