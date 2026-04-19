# Roadmap: Print Ninjaz

## Overview

Print Ninjaz ships in four phases. Phase 1 builds the project scaffold, database schema, auth, and admin product management — the foundation everything else sits on. Phase 2 delivers the full storefront browsing and cart experience so a customer can explore and select products. Phase 3 wires up PayPal checkout and order management so money actually changes hands. Phase 4 finishes the brand, trust content, and responsive polish so the store is ready to go live with real customers.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffold, database schema, auth, and admin product CRUD
- [x] **Phase 2: Storefront + Cart** - Product catalog, product detail pages, and shopping cart
- [ ] **Phase 3: Checkout + Orders** - PayPal payment, order confirmation, and order management
- [ ] **Phase 4: Brand + Launch** - Trust content, PDPA compliance, branding, and responsive polish
- [ ] **Phase 5: Admin Extensions** - User mgmt, coupons, inventory toggle, bulk import, store settings UI, analytics, email template editor, reviews moderation, shipping rates
- [x] **Phase 6: Customer Account** - /account profile, saved addresses, wishlist, product reviews, PDF invoices, cancel/return requests

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
- [x] 02-01-PLAN.md — Brand primitives, catalog data helpers, format utilities, ProductCard, install vaul
- [x] 02-02-PLAN.md — Store shell (nav/footer/layout), homepage (hero/featured/categories/how-it-works), /shop with category filter
- [x] 02-03-PLAN.md — Product detail page: gallery, size selector, size guide, material, lead time, Add-to-bag stub
- [x] 02-04-PLAN.md — Zustand cart store, vaul drawer primitive, cart drawer + /cart page, wire CartButton + Add-to-bag

### Phase 3: Checkout + Orders
**Goal**: Customers can complete a purchase via PayPal and both customer and admin can track what was ordered
**Depends on**: Phase 2
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, ORD-01, ORD-02, ADM-05, ADM-06
**Success Criteria** (what must be TRUE):
  1. User can proceed from bag to checkout, enter a shipping address, and pay via PayPal in MYR (vocab per Phase 2 DECISIONS.md D-02)
  2. User sees an order confirmation page immediately after successful payment
  3. User receives an order confirmation email (nodemailer + cPanel SMTP) with a full order summary
  4. User can view their order history and individual order details including current status
  5. Admin can view all orders with customer info and update order status from pending through to delivered
**Plans**: 4 plans

Plans:
- [ ] 03-01-PLAN.md — Orders + order_items schema migration, status state machine, order-number helper, PayPal SDK client, address Zod schema (Wave 1)
- [ ] 03-02-PLAN.md — /checkout page + address form + PayPal Buttons, create/capture server actions with server-side price derivation, signature-verified webhook (Wave 2)
- [ ] 03-03-PLAN.md — /orders list, /orders/[id] confirmation+detail, order-confirmation email (HTML+text), resend-receipt (rate-limited) (Wave 3)
- [ ] 03-04-PLAN.md — /admin/orders list with filter, /admin/orders/[id] detail, status-transition form, internal notes (Wave 4)

### Phase 4: Brand + Launch
**Goal**: The store looks and feels like 3D Ninjaz and meets Malaysian legal requirements — ready for real customers
**Depends on**: Phase 3
**Requirements**: BRAND-01, BRAND-02, BRAND-03, BRAND-04, BRAND-05, RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. Site displays 3D Ninjaz logo, ninja-themed copy, and the unified blue/green/purple + ink/cream color scheme (per Phase 2 DECISIONS.md D-01) consistently across all pages
  2. Site has About and Contact pages with business information and a WhatsApp contact link
  3. Site has a privacy policy page compliant with PDPA 2010 and the registration consent checkbox links to it
  4. All pages are fully mobile-responsive with no horizontal scroll, tap targets of at least 44px, and load in under 2 seconds on mobile
**Plans**: 4 plans

Plans:
- [ ] 04-01-PLAN.md — Root metadata, favicon set, JSON-LD, OG/Twitter cards (Wave 1)
- [ ] 04-02-PLAN.md — About, Contact, Privacy (PDPA 2010), Terms pages + WhatsApp CTA (Wave 1)
- [ ] 04-03-PLAN.md — SiteNav/SiteFooter unification + responsive sweep at 320/375/390/768/1024/1440 + image audit + Lighthouse gates (Wave 2)
- [ ] 04-04-PLAN.md — robots.txt, sitemap.xml, .htaccess (HTTPS+HSTS), coming-soon neutralisation, production deploy + smoke test (Wave 3)

### Phase 5: Admin Extensions
**Goal**: Admin has every control needed to operate the store day-to-day — users, coupons, inventory, bulk ops, branding, metrics, emails, reviews, shipping rates — no more code edits for routine management tasks.
**Depends on**: Phase 4
**Requirements**: ADM-07, ADM-08, ADM-09, ADM-10, ADM-11, ADM-12, ADM-13, ADM-14, ADM-15, PROMO-01, PROMO-02, INV-01, INV-02, REV-01, SHIP-01, SETTINGS-01, REPORT-01 (new requirement IDs — add to REQUIREMENTS.md during planning)
**Success Criteria** (what must be TRUE):
  1. Admin can view a list of all customer accounts with registration date, last login, order count, and suspend/unsuspend any non-admin user
  2. Admin can create, edit, and deactivate discount codes (percentage or fixed MYR off, min-spend, start/end date, usage cap)
  3. Admin can toggle a product as out-of-stock or mark a variant low-stock without deleting it
  4. Admin can import a CSV of products (name, description, category, S/M/L prices, image URLs) and see a success/failure report
  5. Admin can edit store settings (business name, contact details, WhatsApp number, socials, banner announcement) through a form without touching env vars
  6. Admin can view a dashboard with revenue, order count, top products, and conversion funnel for the last 7/30/90 days
  7. Admin can edit the HTML of transactional email templates (order confirmation, password reset) with a live preview
  8. Admin can moderate customer reviews/ratings (approve, hide, delete) once reviews feature ships
  9. Admin can configure flat shipping rates per MY state, free-shipping thresholds, and SST toggle (off for now but ready)
**Plans**: 7 plans

Plans:
- [ ] 05-01-PLAN.md — Schema additions (coupons, coupon_redemptions, email_templates, reviews, store_settings, shipping_rates) + variant in_stock/low_stock_threshold + Zod schemas + new deps (Wave 1)
- [ ] 05-02-PLAN.md — /admin/users (suspend/unsuspend) + /admin analytics dashboard (revenue, orders, top products, funnel, 7/30/90d range) + /api/events/track (Wave 2)
- [ ] 05-03-PLAN.md — /admin/coupons CRUD + customer /checkout coupon apply + atomic redemption + pricing helper (Wave 2)
- [ ] 05-04-PLAN.md — Inventory toggle (admin + storefront sold-out) + /admin/settings (DB-backed store settings, deprecate business-info.ts) + /admin/shipping (flat rates per MY state, free-ship threshold, SST toggle) (Wave 2)
- [ ] 05-05-PLAN.md — /admin/products/import CSV upload → preview → commit flow (Wave 3)
- [ ] 05-06-PLAN.md — /admin/email-templates editor (HTML + live preview + variable substitution + DOMPurify sanitize) + refactor order-confirmation + password-reset senders to DB-backed templates (Wave 3)
- [ ] 05-07-PLAN.md — /admin/reviews moderation queue (approve / hide / delete) + sidebar pending-count badge (Wave 3)

### Phase 6: Customer Account
**Goal**: Logged-in customers have a full self-service account — view/edit profile, manage saved addresses, build wishlists, write product reviews, download invoices, request cancels/returns — no need to email for routine account tasks.
**Depends on**: Phase 5 (reviews moderation admin, coupon/user schemas)
**Requirements**: CUST-01, CUST-02, CUST-03, CUST-04, CUST-05, CUST-06, CUST-07, CUST-08
**Success Criteria** (what must be TRUE):
  1. User can open `/account` and see name, email, join date, total order count, and loyalty points (even if points engine defers)
  2. User can update display name + email (email change triggers verification) and change password from `/account/security`
  3. User can manage saved shipping addresses (CRUD, mark default) and use them at checkout via a dropdown
  4. User can add products to a wishlist from PDP/shop and view/remove them on `/account/wishlist`
  5. User can leave a star rating + review on any product they have bought; reviews show pending state until admin approves (Phase 5 moderation queue)
  6. User can download a PDF invoice from any paid order at `/orders/[id]`
  7. User can request an order cancel (if not yet shipped) or a return (within 14 days of delivery) via a form; admin sees the request in `/admin/orders/[id]`
  8. User can close their account — account flagged as deleted, personal data anonymised, orders retained per PDPA D-06 retention
**Plans**: 7 plans

Plans:
- [x] 06-01-PLAN.md — Schema additions (addresses, wishlists, order_requests, conditional reviews IF NOT EXISTS) + user.deletedAt column + requireUser() helper + Phase 6 Zod schemas + @react-pdf/renderer dep (Wave 1)
- [x] 06-02-PLAN.md — /account shell + /account profile + /account/security (Better Auth changeEmail + changePassword) + UserNav dropdown extension (Wave 2)
- [x] 06-03-PLAN.md — /account/addresses CRUD + mark-default transaction + checkout AddressPicker integration without regression (Wave 2)
- [x] 06-04-PLAN.md — Wishlist server actions (toggle + list + batch-hydrate) + WishlistButton + ProductCard/PDP integration + /account/wishlist list page (Wave 2)
- [x] 06-05-PLAN.md — Buyer-gated review submission on /orders/[id] + storefront reviews list + avg rating badge on PDP (Wave 3)
- [x] 06-06-PLAN.md — /orders/[id]/invoice.pdf (@react-pdf/renderer) with rate limit + cancel/return request flow + admin approve/reject (Wave 3)
- [x] 06-07-PLAN.md — /account/close PDPA-compliant soft-delete + requireUser() deletedAt hardening + homepage closure banner (Wave 3)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-04-19 |
| 2. Storefront + Cart | 4/4 | Complete | 2026-04-19 |
| 3. Checkout + Orders | 4/4 | Complete | 2026-04-19 |
| 4. Brand + Launch | 2/4 | In progress | - |
| 5. Admin Extensions | 0/7 | Not started | - |
| 6. Customer Account | 7/7 | Complete | 2026-04-19 |
