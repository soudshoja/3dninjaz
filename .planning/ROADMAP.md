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
- [x] **Phase 3: Checkout + Orders** - PayPal payment, order confirmation, and order management
- [x] **Phase 4: Brand + Launch** - Trust content, PDPA compliance, branding, and responsive polish
- [x] **Phase 5: Admin Extensions** - User mgmt, coupons, inventory toggle, bulk import, store settings UI, analytics, email template editor, reviews moderation, shipping rates
- [x] **Phase 6: Customer Account** - /account profile, saved addresses, wishlist, product reviews, PDF invoices, cancel/return requests
- [x] **Phase 7: Manual Orders + Image Pipeline + Custom Errors** - Admin creates one-off custom orders with PayPal payment-link generator, automatic image compression on every upload (WebP/AVIF, size + quality tiers), branded 404/500/maintenance pages
- [x] **Phase 16: Product Variant System (Generic Options)** - Replace fixed size/color with admin-defined option/value/variant model (cartesian combos, per-variant price/stock/image/SKU). Supports size+color products AND parts-based products in one system.
- [x] **Phase 17: Variant Enhancements + Legacy Cleanup** - Sale price, variant image upload + PDP swap, bulk edit, OOS hardening, default pre-selection, reactivity contract, pre-variant-era code purged
- [ ] **Phase 18: Colour Management** - Admin colour library (seeded from Bambu/Polymaker HTML files, reusable across products), per-product enable/disable toggle, colour joins variant system as additional axis when enabled, PDP swatch grid (name + hex)
- [ ] **Phase 19: User & Role Management** - Admin can create users and define roles; each system feature is enable/disable per role (RBAC matrix). Replaces the current single-admin model.

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
- [x] 05-01-PLAN.md — Schema additions (coupons, coupon_redemptions, email_templates, reviews, store_settings, shipping_rates) + variant in_stock/low_stock_threshold + Zod schemas + new deps (Wave 1)
- [x] 05-02-PLAN.md — /admin/users (suspend/unsuspend) + /admin analytics dashboard (revenue, orders, top products, funnel, 7/30/90d range) + /api/events/track (Wave 2)
- [x] 05-03-PLAN.md — /admin/coupons CRUD + customer /checkout coupon apply + atomic redemption + pricing helper (Wave 2)
- [x] 05-04-PLAN.md — Inventory toggle (admin + storefront sold-out) + /admin/settings (DB-backed store settings, deprecate business-info.ts) + /admin/shipping (flat rates per MY state, free-ship threshold, SST toggle) (Wave 2)
- [x] 05-05-PLAN.md — /admin/products/import CSV upload → preview → commit flow (Wave 3)
- [x] 05-06-PLAN.md — /admin/email-templates editor (HTML + live preview + variable substitution + DOMPurify sanitize) + refactor order-confirmation + password-reset senders to DB-backed templates (Wave 3)
- [x] 05-07-PLAN.md — /admin/reviews moderation queue (approve / hide / delete) + sidebar pending-count badge (Wave 3)

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

### Phase 7: Manual Orders + PayPal Ops Mirror + Image Pipeline + Custom Errors
**Goal**: Admin operates the store like a real retail counter — books one-off custom orders with PayPal-link generation, sees PayPal transaction-level financials AND manages refunds/disputes WITHOUT leaving the app, every uploaded image is auto-compressed for web speed, and broken pages render branded "ninja got lost" screens instead of generic stack traces.
**Depends on**: Phase 5 (admin shell + analytics) and Phase 3 (PayPal SDK)
**Requirements**: ADM-16, ADM-17, ADM-18, ADM-19, ADM-20, ADM-21, ADM-22, ADM-23, IMG-01, IMG-02, IMG-03, ERR-01, ERR-02, ERR-03 (add to REQUIREMENTS.md during planning)
**Success Criteria** (what must be TRUE):
  1. Admin can open `/admin/orders/new` and create a one-off custom order with: customer name, optional customer email (assigns to existing user if matched, else stand-alone), item name, item description/note, multiple uploaded images, manual amount in MYR, and shipping address
  2. The custom order shows in `/admin/orders` and `/admin/payments` exactly like a normal order; status flows through the same state machine
  3. Admin can click "Generate payment link" on the custom order — system calls PayPal `orders/create` with the order amount and returns a unique payment URL the admin shares with the customer (WhatsApp / email / SMS)
  4. When the customer pays via the link, the same webhook + capture flow records `paypalCaptureId` against the custom order
  5. **PayPal payment page parity** — `/admin/payments` and `/admin/orders/[id]` fetch capture detail from PayPal `GET /v2/payments/captures/{id}` and display: gross MYR, **PayPal fee**, **net amount the seller receives**, currency, transaction status (COMPLETED / REFUNDED / PARTIALLY_REFUNDED / PENDING / DECLINED), seller-protection eligibility, settle date — exactly mirroring the PayPal Activity dashboard so admin never has to log into paypal.com to verify earnings
  6. **Refund from admin** — admin clicks "Refund" on a captured payment → enters amount (full or partial) + reason → server calls PayPal `POST /v2/payments/captures/{id}/refund` → records `refunded_amount` on the order + flips status; webhook reconciliation idempotent
  7. **Disputes / claims** — `/admin/disputes` lists open buyer claims fetched from PayPal `GET /v1/customer/disputes`; admin can: view dispute thread + buyer evidence (`GET /v1/customer/disputes/{id}`), accept the claim (`POST .../accept-claim`), provide a defence with file attachments (`POST .../provide-evidence`), and escalate to PayPal arbiter (`POST .../escalate-to-arbiter`). Live "Customer disputes" capability already approved on the 3dninjaz PayPal app
  8. **Daily reconciliation** — nightly cron pulls `GET /v1/reporting/transactions` for the prior day, compares each PayPal transaction to local `orders.paypalCaptureId`, flags any drift (refunds processed externally, missing captures, etc.) on the admin dashboard
  9. Every image uploaded anywhere (admin product images, custom order images, future user-uploaded review images) is automatically compressed: original kept as `.bak`, served versions are WebP + AVIF + a JPEG fallback at 3 widths (400/800/1600 px) at quality ~78
  10. Image responses include long-cache `Cache-Control` headers and the storefront `<Image>` components emit a `srcset` matching the generated tiers
  11. 404, 500, and maintenance pages render a branded ninja illustration + helpful copy (no generic Next.js error frame); errors logged server-side with request id
**Plans**: 9 plans

Plans:
- [x] 07-01-PLAN.md — Schema additions (payment_links, dispute_cache, recon_runs) + 9 new orders columns + sharp/dotenv deps + raw-SQL migration applicator + .gitignore intel dir (Wave 1)
- [x] 07-02-PLAN.md — PayPal SDK extensions: disputesController, getCaptureDetails, paypal-refund.ts, paypal-disputes.ts, paypal-reporting.ts with OAuth + raw-fetch fallback (Wave 1)
- [x] 07-03-PLAN.md — /admin/orders/new manual order form + payment-links server actions + public /payment-links/[token] page with PayPal Smart Button (Wave 2)
- [x] 07-04-PLAN.md — /admin/payments enriched (gross/fee/net/seller-protection/settle) + /admin/payments/[orderId] detail with PaymentFinancialsPanel + cache hydration on first live fetch (Wave 2)
- [x] 07-05-PLAN.md — /admin/payments/[orderId]/refund: refund-form with two-step confirm + cap + rate-limit + PAYMENT.CAPTURE.REFUNDED idempotent webhook handler (Wave 2)
- [x] 07-06-PLAN.md — /admin/disputes list + /admin/disputes/[id] detail with evidence uploader + accept-claim + escalate-to-arbiter (Wave 3)
- [x] 07-07-PLAN.md — Nightly recon cron (CJS) + /admin/recon history + drift dashboard widget + sidebar drift badge + cPanel cron registration (Wave 3)
- [x] 07-08-PLAN.md — sharp image-pipeline (3 widths × 3 formats) + ResponsiveProductImage + storefront srcset wiring + Cache-Control headers + backfill script (Wave 4)
- [x] 07-09-PLAN.md — Branded 404/500/maintenance pages + middleware MAINTENANCE_MODE redirect + error-reporting helper (Wave 4)

### Phase 8: Delyva Shipping
**Goal**: Integrate Delyva courier — live rate quotes at checkout, admin books shipments + prints labels, HMAC-verified webhooks, admin shipping config.
**Status**: COMPLETE (2026-04-20)
See: `.planning/phases/08-delyva-shipping/COMPLETION.md`

### Phase 9: Theme + UX Polish
**Goal**: Lighten storefront theme; fix admin nav; About Us page; ninja mascot icons; branded Apache error pages; auth login unification; CI gate.
**Status**: COMPLETE (2026-04-20)
See: `.planning/phases/09-theme-ux-polish/COMPLETION.md`

### Phase 10: Cost & Profit Tracking
**Goal**: Track material costs per variant, snapshot at checkout, show profit in admin.
**Status**: COMPLETE (2026-04-20/21)
See: `.planning/phases/10-cost-profit/COMPLETION.md`

### Phase 11: Site Settings + Social
**Goal**: Per-platform social URL fields in admin settings; PayPal live switch complete.
**Status**: COMPLETE (2026-04-20)
See: `.planning/phases/11-site-settings-social/COMPLETION.md`

### Phase 12: Email System
**Goal**: Expand from 2 → 12 transactional templates; newsletter subscriber signup + admin management + unsubscribe flow.
**Status**: COMPLETE (2026-04-20/21)
See: `.planning/phases/12-email-system/COMPLETION.md`

### Phase 13: Per-Variant Inventory Track Stock
**Goal**: Optional `track_stock` flag per variant; OOS badge only when tracking enabled; inventory inline in product form.
**Status**: COMPLETE (2026-04-21)
See: `.planning/phases/13-inventory-tracking/COMPLETION.md`

### Phase 14: Cost Breakdown with Store Defaults
**Goal**: Replace single cost_price with filament/electricity/labor/overhead breakdown using store defaults; auto-computed cost_price; Better Auth trustedOrigins fix.
**Status**: COMPLETE (2026-04-21)
See: `.planning/phases/14-cost-breakdown/COMPLETION.md`

### Phase 15: Customer + Admin Shipment Tracking
**Goal**: Live Delyva tracking timeline on customer order page and enriched admin shipment panel.
**Status**: COMPLETE (2026-04-20)
See: `.planning/phases/15-customer-tracking/COMPLETION.md`

### Phase 16: Product Variant System (Generic Options)
**Goal**: Replace fixed `productVariants.size` enum with a generic options/values/variants model so admin can define any attribute (Size, Color, Part, Material) per product. Supports current size+color products and new parts-based products (each part a separate variant) without schema changes for new attribute types.
**Depends on**: Phase 7 (last schema touchpoint); affects Phases 1, 2, 3, 5, 6, 10, 13, 14 downstream
**Requirements**: VAR-01, VAR-02, VAR-03, VAR-04, VAR-05, VAR-06 (new — add to REQUIREMENTS.md during planning)
**Success Criteria** (what must be TRUE):
  1. Admin can create a product and define 1..3 options per product (e.g., "Size", "Color", "Part") with arbitrary value lists (e.g., Size=[S,M,L], Color=[Red,Blue], Part=[Arm,Head,Leg])
  2. System auto-generates the cartesian variant matrix from options; admin can delete impossible combos, set per-variant price, stock, SKU, and image
  3. Existing products auto-migrate: each legacy `productVariants` row (size S/M/L) becomes an `options=[Size]` product with one variant per size — zero customer-visible regression
  4. Storefront PDP shows a variant selector that renders correctly for any option count (swatches for Color, pills for Size/Part) and updates price + stock + image on selection
  5. Cart, checkout, orders, order_items, inventory track_stock, cost breakdown, and PayPal line items all reference `variant_id` and surface the variant's human-readable label (e.g., "Small / Red" or "Left Arm / Blue")
  6. Admin can create a "parts-based" product (options=[Part], optional Color) with 5+ variants each with its own price, stock, and image — completes a PayPal purchase end-to-end
**Plans**: 7 plans

Plans:
- [x] 16-01-PLAN.md — Schema + migration applicator (options, option_values, variant columns, order_items.variant_label) + Zod + REQUIREMENTS (Wave 1)
- [x] 16-02-PLAN.md — Backfill existing size variants to option1_value_id + dual-read helpers in src/lib/variants.ts + catalog hydration (Wave 1)
- [x] 16-03-PLAN.md — Admin /admin/products/[id]/variants — option editor + matrix generator + per-variant inline editor (Wave 2)
- [x] 16-04-PLAN.md — Storefront PDP variant selector (N options, swatches for Color, pills otherwise) (Wave 2)
- [x] 16-05-PLAN.md — Cart v2 (variantId only) + checkout/orders rewire + PayPal line items (Wave 3)
- [x] 16-06-PLAN.md — Inventory / cost breakdown / CSV import adapted to generic variants (Wave 3)
- [x] 16-07-PLAN.md — Drop legacy size column + parts-product seed + E2E smoke test + COMPLETION.md (Wave 4)

### Phase 17: Variant Enhancements + Legacy Cleanup + Reactivity Guarantee
**Goal**: Close the 5 critical WooCommerce gaps surfaced by the Phase 16 gap analysis (sale price, variant image upload + PDP swap, bulk edit, OOS graying hardened, default variant pre-selection); codify the admin-editor reactivity contract (every mutation reflects without a full page refresh); and sweep up pre-variant-era code (SizeSelector, SizeGuide, legacyAddToCart, `"S"|"M"|"L"` literals, `widthCm/heightCm/depthCm` references, CSV price_s/m/l back-compat, size-centric admin-guide copy).
**Depends on**: Phase 16
**Requirements**: VAR-07, VAR-08, VAR-09, VAR-10, VAR-11 (new — add to REQUIREMENTS.md during planning). VAR-07: Per-variant shipping weight drives Delyva quote (AD-08).
**Success Criteria** (what must be TRUE):
  1. Admin can set a per-variant `sale_price` with optional `sale_from` / `sale_to` window; PDP renders strikethrough regular + bold sale + "ON SALE" badge when active
  2. Admin uploads an image directly in the variant matrix row (reuses Phase 7 image pipeline); PDP gallery swaps primary image to selected variant's image when set
  3. Admin selects variant rows via checkboxes and applies bulk ops (set-all-price, multiply-by-%, add-fixed-MYR, set-sale-price, toggle-active, delete-selected); single transaction on the server; reactive UI
  4. Admin marks one variant as default; PDP pre-selects that variant on load; single-default invariant enforced via `setDefaultVariant` transaction
  5. Out-of-stock combos on the PDP are visually grayed, keyboard-unreachable (`tabIndex=-1`, `aria-disabled=true`), and show `title="Out of stock"` tooltip
  6. Every admin mutation in `variant-editor.tsx` reflects in the UI without a full page refresh — per the Reactivity Contract (AD-06): Pattern A optimistic + rollback for field edits, Pattern B `getVariantEditorData` refetch for shape-changing ops
  7. All 19 legacy-cleanup findings from 17-CONTEXT inventory actioned (L-01..L-14, L-16 executed as atomic commits; L-15/L-12/L-17/L-18/L-19 triaged as "no action" or "flagged")
  8. TypeScript `npx tsc --noEmit` clean; zero new lint errors; PayPal sandbox E2E of sale-priced product captures correct unit price in `order_items.unit_price`
  9. A variant with non-null `weight_g` drives the Delyva shipping quote for any cart containing that variant, verified by changing the weight and observing a quote delta (VAR-07, AD-08)
**Plans**: 5 plans

Plans:
- [x] 17-01-PLAN.md — Schema (sale_price, sale_from, sale_to, is_default) + Zod + raw-SQL migration applicator (Wave 1)
- [x] 17-02-PLAN.md — Admin variant editor extensions: sale inputs, default toggle, bulk toolbar, image upload per row, reactivity contract enforcement (Wave 1)
- [x] 17-03-PLAN.md — PDP: effective price + ON SALE badge, default pre-selection, OOS hardening, variant image gallery swap (Wave 2)
- [x] 17-04-PLAN.md — Legacy cleanup — one atomic commit per finding (SizeSelector/SizeGuide deletion, legacyAddToCart, S|M|L purge, admin-guide rewrite, CSV price_s/m/l removal) (Wave 2)
- [x] 17-05-PLAN.md — E2E PayPal sandbox smoke test + COMPLETION.md + ROADMAP + STATE update (Wave 3)

### Phase 18: Colour Management
**Goal**: Admin manages a central, reusable colour library (seeded once from Bambu + Polymaker HTML files) and picks per-product subsets via a picker modal in the variant editor. Colour joins the variant system as a normal axis (1 of 6). PDP renders swatches with name always visible (no hover); /shop offers a multi-select sidebar chip filter URL-synced to ?colour= and intersecting the existing category filter. Codes/family/previous_hex stay admin-only.
**Depends on**: Phase 16, Phase 17
**Requirements**: REQ-1 (colors table schema), REQ-2 (HTML seed script), REQ-3 (admin /admin/colours CRUD), REQ-4 (in-use deletion guard + soft-archive), REQ-5 (per-product picker integration with custom one-off fallback), REQ-6 (Colour counts as 1 of 6 axes), REQ-7 (PDP swatch grid with always-visible name + codes hidden), REQ-8 (/shop sidebar chip filter — multi-select, URL-synced, intersects category filter)
**Success Criteria** (what must be TRUE):
  1. `colors` table migrated on MariaDB 10.11; Drizzle schema matches `SHOW CREATE TABLE` byte-for-byte
  2. `tsx scripts/seed-colours.ts` parses both HTML files idempotently (~145 rows; second run = 0 inserts / 0 updates)
  3. Admin manages the library at /admin/colours (list, create, edit, soft-archive, hard-delete with IN_USE guard)
  4. In-use deletion returns `{ok:false, code:"IN_USE", products:[...]}`; soft-archive always allowed
  5. Variant editor shows "Pick from library" button on Colour-named options; picker confirms snapshot name+hex+colorId into pov rows; freeform "Custom (not in library)" path preserved
  6. PDP swatch grid renders 32px hex circle + 12px always-visible name caption (no hover, no codes leaked); selection still updates price/stock/image per Phase 17 reactivity
  7. /shop sidebar shows Colour accordion (default open, first 12 chips, Show all expands) with hex-tinted active state; URL syncs ?colour=galaxy-black,jade-white; intersects category filter
  8. Cascade rename is diff-aware (manual product-level edits preserved) and runs in a single db.transaction
**Plans**: 9 plans

Plans:
- [x] 18-01-PLAN.md — Schema (colors table + product_option_values.color_id FK) + helpers (colours.ts + colour-contrast.ts) + Zod + [BLOCKING] raw-SQL DDL applicator (Wave 1)
- [x] 18-02-PLAN.md — HTML parser + idempotent seed script (Bambu + Polymaker → ~145 rows; em-dash codes → NULL; dual/gradient skipped) (Wave 1)
- [ ] 18-03-PLAN.md — Admin /admin/colours CRUD module — list page + new/edit forms + 6 server actions (list/get/create/update/archive/reactivate) + sidebar nav (Wave 2)
- [ ] 18-04-PLAN.md — In-use deletion guard (IN_USE error UI with product links + Archive instead CTA) + diff-aware cascade rename in db.transaction with 1000-row guard (Wave 2)
- [ ] 18-05-PLAN.md — ColourPickerDialog component (shadcn Dialog, 720px, client-side filter, multi-select stage, batch confirm) + getActiveColoursForPicker + attachLibraryColours server actions (Wave 3)
- [ ] 18-06-PLAN.md — variant-editor.tsx integration: mount picker on Colour-named options, custom-fallback relabel "Custom (not in library)", Pattern B refetch on confirm (Wave 3)
- [ ] 18-07-PLAN.md — PDP variant-selector refactor: always-visible name caption (32px circle + 12px caption, weight 500/700, OOS line-through); pill rendering for non-Colour options untouched (Wave 4)
- [ ] 18-08-PLAN.md — /shop sidebar Colour chip filter (accordion + hex-tinted active state) + getActiveProductColourChips + getProductIdsByColourSlugs (manual hydration, no LATERAL); URL grammar ?colour=slug,slug (Wave 4)
- [ ] 18-09-PLAN.md — Admin guide article (src/content/admin-guide/products/colours.md) + full CI battery (tsc + lint + build) + 24-step manual smoke checklist for verifier (Wave 4)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → ... → 15

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-04-19 |
| 2. Storefront + Cart | 4/4 | Complete | 2026-04-19 |
| 3. Checkout + Orders | 4/4 | Complete | 2026-04-19 |
| 4. Brand + Launch | 4/4 | Complete | 2026-04-20 |
| 5. Admin Extensions | 7/7 | Complete | 2026-04-19 |
| 6. Customer Account | 7/7 | Complete | 2026-04-19 |
| 7. Manual Orders + Image Pipeline + Custom Errors | 9/9 | Complete | 2026-04-20 |
| 8. Delyva Shipping | — | Complete | 2026-04-20 |
| 9. Theme + UX Polish | — | Complete | 2026-04-20 |
| 10. Cost & Profit Tracking | — | Complete | 2026-04-21 |
| 11. Site Settings + Social | — | Complete | 2026-04-20 |
| 12. Email System | — | Complete | 2026-04-21 |
| 13. Per-Variant Inventory Track Stock | — | Complete | 2026-04-21 |
| 14. Cost Breakdown with Store Defaults | — | Complete | 2026-04-21 |
| 15. Customer + Admin Shipment Tracking | — | Complete | 2026-04-20 |
| 16. Product Variant System (Generic Options) | 7/7 | Complete | 2026-04-22 |
| 17. Variant Enhancements + Legacy Cleanup | 5/5 | Complete | 2026-04-22 |
| 18. Colour Management | 2/9 | In Progress|  |
| 19. User & Role Management | 0/0 | Backlog | — |
