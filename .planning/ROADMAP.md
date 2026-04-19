# Roadmap: Print Ninjaz

## Overview

Print Ninjaz ships in four phases. Phase 1 builds the project scaffold, database schema, auth, and admin product management — the foundation everything else sits on. Phase 2 delivers the full storefront browsing and cart experience so a customer can explore and select products. Phase 3 wires up PayPal checkout and order management so money actually changes hands. Phase 4 finishes the brand, trust content, and responsive polish so the store is ready to go live with real customers.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffold, database schema, auth, and admin product CRUD
- [ ] **Phase 2: Storefront + Cart** - Product catalog, product detail pages, and shopping cart
- [ ] **Phase 3: Checkout + Orders** - PayPal payment, order confirmation, and order management
- [ ] **Phase 4: Brand + Launch** - Trust content, PDPA compliance, branding, and responsive polish

## Phase Details

### Phase 1: Foundation
**Goal**: Admin can manage products and users can create accounts — the operational backbone is live
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, ADM-01, ADM-02, ADM-03, ADM-04
**Success Criteria** (what must be TRUE):
  1. User can create an account with email and password and check the PDPA consent checkbox during registration
  2. User can log in and remain logged in across browser sessions, and log out from any page
  3. User can reset a forgotten password via an emailed link
  4. Admin can create a product with name, description, multiple images, and individual prices for S, M, and L sizes
  5. Admin can edit, delete, and toggle any product active or inactive from the admin panel
**Plans:** 4 plans

Plans:
- [x] 01-01-PLAN.md — Scaffold Next.js 15, install deps, create DB schema, configure Better Auth
- [x] 01-02-PLAN.md — Build auth UI (login, register, forgot/reset password), admin seed script
- [x] 01-03-PLAN.md — Admin layout, server actions, product list, category management
- [x] 01-04-PLAN.md — Product create/edit forms with local-disk upload and variant pricing

### Phase 2: Storefront + Cart
**Goal**: Customers can browse products, read details, and build a cart — the full pre-purchase experience works end to end
**Depends on**: Phase 1
**Requirements**: PROD-01, PROD-02, PROD-03, PROD-04, PROD-05, PROD-06, CART-01, CART-02, CART-03, CART-04, CART-05
**Success Criteria** (what must be TRUE):
  1. User can browse all active products in a responsive grid and see name, image, and price
  2. User can open a product detail page showing multiple images, description, size guide with real dimensions, material info, and lead time notice
  3. User can select a size (S/M/L) and see the price update to match that variant before adding to cart
  4. User can view a cart showing each item's name, size, quantity, and price, update quantities, remove items, and see a running subtotal
**Plans**: 4 plans

Plans:
- [ ] 02-01-PLAN.md — Brand primitives, catalog data helpers, format utilities, ProductCard, install vaul
- [ ] 02-02-PLAN.md — Store shell (nav/footer/layout), homepage (hero/featured/categories/how-it-works), /shop with category filter
- [ ] 02-03-PLAN.md — Product detail page: gallery, size selector, size guide, material, lead time, Add-to-bag stub
- [ ] 02-04-PLAN.md — Zustand cart store, vaul drawer primitive, cart drawer + /cart page, wire CartButton + Add-to-bag

### Phase 3: Checkout + Orders
**Goal**: Customers can complete a purchase via PayPal and both customer and admin can track what was ordered
**Depends on**: Phase 2
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, ORD-01, ORD-02, ADM-05, ADM-06
**Success Criteria** (what must be TRUE):
  1. User can proceed from cart to checkout, enter a shipping address, and pay via PayPal in MYR
  2. User sees an order confirmation page immediately after successful payment
  3. User receives an order confirmation email with a full order summary
  4. User can view their order history and individual order details including current status
  5. Admin can view all orders with customer info and update order status from pending through to delivered
**Plans**: TBD

### Phase 4: Brand + Launch
**Goal**: The store looks and feels like Print Ninjaz and meets Malaysian legal requirements — ready for real customers
**Depends on**: Phase 3
**Requirements**: BRAND-01, BRAND-02, BRAND-03, BRAND-04, BRAND-05, RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. Site displays Print Ninjaz logo, ninja-themed copy, and green/blue/black color scheme consistently across all pages
  2. Site has an About/Contact page with business information and a WhatsApp contact link
  3. Site has a privacy policy page compliant with PDPA 2010 and the registration consent checkbox links to it
  4. All pages are fully mobile-responsive with no horizontal scroll, tap targets of at least 44px, and load in under 2 seconds on mobile
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/4 | Not started | - |
| 2. Storefront + Cart | 0/4 | Not started | - |
| 3. Checkout + Orders | 0/? | Not started | - |
| 4. Brand + Launch | 0/? | Not started | - |
