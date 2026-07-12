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
- [ ] **ADM-16**: Admin can create a one-off (custom) order at `/admin/orders/new` with customer name, optional matched-or-snapshot email, item name + description, multiple uploaded images, manual MYR amount, and shipping address — appears in `/admin/orders` and `/admin/payments` like a normal order
- [ ] **ADM-17**: Admin can generate a unique PayPal payment link for a custom order at `/payment-links/[token]` (no PII in URL); customer pays via the link and the same webhook + capture flow records `paypalCaptureId` against the custom order
- [ ] **ADM-18**: `/admin/payments` and `/admin/orders/[id]` display per-capture financials fetched live from PayPal `GET /v2/payments/captures/{id}` — gross MYR, PayPal fee, net amount the seller receives, currency, transaction status (COMPLETED / REFUNDED / PARTIALLY_REFUNDED / PENDING / DECLINED), seller-protection eligibility, settle date — mirroring the PayPal Activity dashboard
- [ ] **ADM-19**: Admin can issue a full or partial refund from `/admin/payments/[orderId]` via PayPal `POST /v2/payments/captures/{id}/refund`, with server-side amount cap (refund ≤ remaining capture), reason field, and idempotent webhook reconciliation
- [ ] **ADM-20**: Admin can list open buyer disputes at `/admin/disputes` (live via PayPal `GET /v1/customer/disputes`) and view full thread + buyer evidence at `/admin/disputes/[id]`
- [ ] **ADM-21**: Admin can accept a dispute claim, provide a defence with file attachments, and escalate to PayPal arbiter from `/admin/disputes/[id]` (calls `accept-claim`, `provide-evidence`, `escalate-to-arbiter` endpoints), with rate-limit (10/min/admin) and dispute-to-order verification
- [ ] **ADM-22**: A nightly cPanel cron pulls `GET /v1/reporting/transactions` for the prior day, compares each PayPal transaction to local `orders.paypalCaptureId`, persists drift to `recon_runs` table, and writes a JSON snapshot to `.planning/intel/recon-YYYY-MM-DD.json`
- [ ] **ADM-23**: Admin dashboard surfaces a reconciliation drift widget showing the latest run timestamp, drift count, and a deep link to per-run detail; latest drift count exposed as a navigation badge

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

### Customer Account (Phase 6)

- [x] **CUST-01**: Logged-in user can open `/account` and see name, email, join date, total order count, and a loyalty-points placeholder card (zero points in v1)
- [x] **CUST-02**: User can change email (with Better Auth verification flow) and change password (with current-password challenge) from `/account/security`
- [x] **CUST-03**: User can create, edit, delete, and mark-default saved shipping addresses; addresses surface as a dropdown on `/checkout`
- [x] **CUST-04**: User can add a product to a wishlist from PDP and shop grid, view all wishlisted items on `/account/wishlist`, remove from wishlist, and add-to-bag from the wishlist page
- [x] **CUST-05**: User who has bought a product (order status paid/processing/shipped/delivered) can submit a 1-5 star rating + text review; reviews enter the Phase 5 admin moderation queue with `pending` status and appear on the product detail page once approved
- [x] **CUST-06**: User can download a PDF invoice (`/orders/[id]/invoice.pdf`) for any of their orders, rendered server-side via `@react-pdf/renderer` with order details + business footer
- [x] **CUST-07**: User can submit a cancel request (if status ∈ pending/paid and not shipped) or a return request (if status=delivered and within 14 days of delivery) via a textarea reason; admin sees the pending request on `/admin/orders/[id]` and can approve or reject
- [x] **CUST-08**: User can close their account via `/account/close`; closure anonymizes email, marks `deletedAt`, invalidates sessions, and preserves orders per PDPA retention (D-06 7y)

### Image Pipeline (Phase 7)

- [ ] **IMG-01**: Every uploaded image (admin product, custom order, future user-uploaded review) is automatically compressed via `sharp`: original kept under `<base>/orig.<ext>`, served versions are WebP + AVIF + JPEG fallback at 3 widths (400 / 800 / 1600 px) at quality ~78
- [ ] **IMG-02**: Storefront `<Image>` and `<ProductCard>` emit a `srcset` matching the generated tiers (400/800/1600), and the new server-side `pickImage(url)` returns the variant manifest as `{ webp, avif, jpg }` per width
- [ ] **IMG-03**: Variant responses serve with long-cache `Cache-Control: public, max-age=31536000, immutable` headers (set in `next.config.ts` headers() for `/uploads/**`); Next.js `<Image>` srcset emission verified at 320/375/390/768/1024/1440 viewports

### Custom Errors (Phase 7)

- [ ] **ERR-01**: 404 page (`src/app/not-found.tsx`) renders branded ninja illustration + helpful copy + link to homepage and shop, no generic Next.js 404 frame
- [ ] **ERR-02**: 500 page (`src/app/error.tsx` + `src/app/global-error.tsx`) renders branded illustration + "Something went wrong" copy + a request-id reference (logged server-side); NEVER renders the stack trace, error.message, or error.stack to the user
- [ ] **ERR-03**: Maintenance mode page (`src/app/(store)/maintenance/page.tsx`) is shown when `MAINTENANCE_MODE=true` env flag is set; middleware redirects every non-`/admin`, non-`/api/*health*` route to `/maintenance` while flag is on

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

- ~~**SOC-01**: User can leave reviews/ratings on products~~ → Covered by CUST-05 (Phase 6)
- ~~**SOC-02**: User can add products to wishlist~~ → Covered by CUST-04 (Phase 6)

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
| ~~Returns management system~~ | Phase 6 CUST-07 ships customer cancel/return requests + admin approve-reject |
| ~~Customer-side review submission UI~~ | Phase 6 CUST-05 ships buyer-gated review submission on /orders/[id] |
| Coupon stacking | One coupon per order in v1 |
| Shipping label printing / tracking numbers | Manual dispatch in v1 |
| Loyalty points accrual engine | UI placeholder only in CUST-01; engine deferred to a future phase |
| Review editing by customer | Submit-once policy; admin moderation is the only mutation path |
| Wishlist sharing / public URLs | Private account-scoped only in v1 |
| ~~Auto-refund via PayPal API on approved cancel~~ | Phase 7 ADM-19 ships admin refund button (full + partial) via PayPal capture refund API |

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
| ADM-16 | Phase 7 | Pending |
| ADM-17 | Phase 7 | Pending |
| ADM-18 | Phase 7 | Pending |
| ADM-19 | Phase 7 | Pending |
| ADM-20 | Phase 7 | Pending |
| ADM-21 | Phase 7 | Pending |
| ADM-22 | Phase 7 | Pending |
| ADM-23 | Phase 7 | Pending |
| PROMO-01 | Phase 5 | Pending |
| PROMO-02 | Phase 5 | Pending |
| INV-01 | Phase 5 | Pending |
| INV-02 | Phase 5 | Pending |
| REV-01 | Phase 5 | Pending |
| SHIP-01 | Phase 5 | Pending |
| SETTINGS-01 | Phase 5 | Pending |
| REPORT-01 | Phase 5 | Pending |
| CUST-01 | Phase 6 | Pending |
| CUST-02 | Phase 6 | Pending |
| CUST-03 | Phase 6 | Pending |
| CUST-04 | Phase 6 | Pending |
| CUST-05 | Phase 6 | Pending |
| CUST-06 | Phase 6 | Pending |
| CUST-07 | Phase 6 | Pending |
| CUST-08 | Phase 6 | Pending |
| IMG-01 | Phase 7 | Pending |
| IMG-02 | Phase 7 | Pending |
| IMG-03 | Phase 7 | Pending |
| ERR-01 | Phase 7 | Pending |
| ERR-02 | Phase 7 | Pending |
| ERR-03 | Phase 7 | Pending |
| BRAND-01 | Phase 4 | Complete |
| BRAND-02 | Phase 4 | Complete |
| BRAND-03 | Phase 4 | Complete |
| BRAND-04 | Phase 4 | Complete |
| BRAND-05 | Phase 4 | Complete |
| RESP-01 | Phase 4 | Complete |
| RESP-02 | Phase 4 | Complete |
| RESP-03 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 76 total (37 original + 17 Phase 5 additions + 8 Phase 6 additions + 14 Phase 7 additions)
- Mapped to phases: 76
- Unmapped: 0 ✓

## Phase 16 — Variant System

- [ ] **VAR-01**: Admin can define 1..3 named options per product (e.g., Size, Color, Part) with arbitrary value lists; max 3 options enforced
- [ ] **VAR-02**: Cartesian variant matrix is auto-generated from defined options; admin can add/delete combos, set per-variant price, stock, SKU, and image
- [ ] **VAR-03**: Existing products with hardcoded S/M/L size variants are automatically migrated via backfill script with zero customer-visible regression
- [ ] **VAR-04**: Storefront PDP renders a generic N-option variant selector; price, stock, and image update on each selection; swatches rendered for Color options (when swatchHex set)
- [ ] **VAR-05**: Cart, checkout, orders, inventory, cost breakdown, and PayPal line items all reference variantId and surface the composed variant label (e.g., "Medium / Red")
- [ ] **VAR-06**: Admin can create a parts-based product with 5+ variants and complete an end-to-end PayPal checkout flow

## Phase 17 — Variant Enhancements + Legacy Cleanup + Reactivity

- [ ] **VAR-07**: Admin can set optional per-variant weight in grams; Delyva shipping quote uses the variant weight when present, else falls back to product-level weight, else to 500 g default.

## Phase 21 — Admin Meshy AI 3D Generation

- [ ] **REQ-21-1**: meshy_generations + meshy_revisions tables live on MariaDB; Drizzle mirror matches SHOW CREATE TABLE
- [ ] **REQ-21-2**: Server-only Meshy client + private (non-public) model storage; every SUCCEEDED task's files downloaded before workflow state advances (3-day expiry rule)
- [ ] **REQ-21-3**: createGeneration with pre-flight guardrails (jpeg/png only, 10MB cap, 600-char prompt cap client+server, moderation:true, balance guard)
- [ ] **REQ-21-4**: Single advanceGeneration(id) state machine driven by client polling (5-8s) + 5-min cron reconciliation sweep
- [ ] **REQ-21-5**: Review workflow — retexture (10cr) with meshy_revisions history + COUNT(*)-based revisionNumber, regenerate fallback, 3-day retexture-window guard
- [ ] **REQ-21-6**: Approve runs free print/analyze; paid repair (10cr) fires ONLY on explicit admin click
- [ ] **REQ-21-7**: Optional multi-color 3MF conversion (10cr, max_colors 1-16, max_depth 3-6)
- [ ] **REQ-21-8**: Authenticated download Route Handler streams STL/3MF/GLB from private storage (requireAdmin first await)
- [ ] **REQ-21-9**: Admin UI /admin/meshy (list), /new (upload), /[id] (detail with model-viewer, state-matrix actions, printability card, revision history) per 21-UI-SPEC

## Milestone v2.0 Requirements — Multi-Tenant Platform

Admin-provisioned multi-tenant platform pivot. Database-per-tenant isolation, custom domains, admin-provisioned fleet (no self-serve signup/billing), the current live store migrates in as Tenant #1, a payment-gateway plugin architecture, and the first concrete plugin: Reseller (wholesale catalog access, resold under the tenant's own domain). Grounded in `.planning/research/SUMMARY.md` (2026-07-12) — see that file for the full architecture rationale, the resolved Reseller catalog-sharing decision, and the pitfall-to-phase mapping.

### Tenant Infrastructure (TEN)

- [ ] **TEN-01**: Super-admin can create a new tenant, which provisions its own fully isolated MariaDB database
- [ ] **TEN-02**: Incoming requests resolve to the correct tenant based on the request's domain, with no cross-tenant data ever returned
- [x] **TEN-03**: A request to an unrecognized domain hard-fails (404/421) — it never falls back to serving an existing tenant's data
- [ ] **TEN-04**: Every tenant's database schema is migrated independently via a fleet-aware migration runner, with per-tenant migration version tracked
- [ ] **TEN-05**: Each tenant's database is backed up independently of the others

### Super-Admin Panel (SUPER)

- [ ] **SUPER-01**: Super-admin logs in via a platform identity that is completely separate from any tenant's admin account
- [ ] **SUPER-02**: Super-admin can view a list of all tenants with their current status (active/suspended/provisioning)
- [ ] **SUPER-03**: Super-admin can create a new tenant via a guided wizard (domain, initial admin credentials)
- [ ] **SUPER-04**: Super-admin can suspend and later reactivate a tenant
- [ ] **SUPER-05**: Super-admin can view catalog sync status for tenants running the Reseller plugin

### Tenant #1 Cutover (CUTOVER)

- [ ] **CUTOVER-01**: The existing live 3D Ninjaz store operates as Tenant #1 with zero data migration — a registry pointer change only, not a data copy
- [ ] **CUTOVER-02**: The cutover can be rolled back within minutes with no data loss if an issue is found
- [ ] **CUTOVER-03**: All existing customer sessions, carts, and in-flight orders survive the cutover uninterrupted

### Payment Plugin Architecture (PLUGIN)

- [ ] **PLUGIN-01**: Payment gateways are implemented behind a common interface so a new gateway can be added without modifying tenant-facing checkout code
- [ ] **PLUGIN-02**: PayPal is ported to the plugin interface as the first implementation, preserving current checkout behavior for Tenant #1
- [ ] **PLUGIN-03**: Each tenant's payment gateway credentials are stored per-tenant at runtime, never baked into the build (no `NEXT_PUBLIC_*` gateway secrets)

### Reseller Plugin (RESELL)

- [ ] **RESELL-01**: Super-admin can grant a tenant "reseller" entitlement with access to a defined set of products at wholesale pricing
- [ ] **RESELL-02**: Entitled products sync one-way from the supplier catalog (Tenant #1) into the reseller tenant's own database, preserving product identity (same UUIDs)
- [ ] **RESELL-03**: A reseller tenant can set their own retail price on synced products; platform-owned fields (content, structure, wholesale cost) stay supplier-controlled and are not editable by the reseller
- [ ] **RESELL-04**: Wholesale cost flows into the existing `product_variants.cost_price` field so profit margin is visible through the store's existing margin/accounting reporting with no new UI
- [ ] **RESELL-05**: A reseller's sold orders are forwarded to the supplier's production/fulfillment queue
- [ ] **RESELL-06**: A margin rule can auto-set a reseller's retail price as a percentage markup over wholesale cost

### Isolation Verification (VERIFY)

- [ ] **VERIFY-01**: A second (test) tenant provisions fully end-to-end (domain, database, admin account) and passes a cross-tenant isolation check battery before the platform is considered production-ready

### Future Requirements (v1.x — deferred, trigger-based)

- Impersonation: super-admin can log in as a tenant's admin for support, with an audit log — deferred until the first real need to debug inside a tenant arises
- Reseller order tracking sync-back + reseller-branded shipping notifications — deferred until real reseller order volume exists
- Cross-fleet analytics rollup for the super-admin panel
- Reseller browse-and-import self-serve catalog UI — v1 reseller catalog access is admin-granted, not self-serve

### Out of Scope

- **Self-serve tenant signup + billing** — this is an admin-provisioned fleet the store owner manages directly, not an open SaaS product. No subscription/billing plumbing in v1.
- **Two-way catalog sync / reseller content edits** — the supplier (Tenant #1) remains the sole content owner; two-way sync would need conflict-resolution logic that isn't needed for a wholesale-resell model.
- **Per-tenant feature gating** — every tenant runs the full existing feature set in v1; gating is a future milestone if ever needed.
- **Process-per-tenant deployment** — a single Node process serves all tenants via per-request tenant resolution; this fits the single cPanel box hosting reality.
- **Automated payment splitting** — the Reseller plugin uses a manual-transfer settlement ledger in v1, not automated payout splitting.
- **Real-time cross-database stock/catalog checks** — the sync-copy model accepts minutes-level staleness; orders already snapshot prices, so this is harmless.
- **Cross-tenant SSO** — each tenant runs its own independent Better Auth instance.
- **Theme builder / wildcard subdomains** — not requested; custom domains per tenant is the locked routing model.

### Traceability

Mapped during v2.0 roadmap creation (2026-07-12). Phases 23–30 — Phase 22 is reserved for the Admin Parametric Model Maker (PR #184, separate branch).

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEN-01 | Phase 25 | Pending |
| TEN-02 | Phase 24 | Pending |
| TEN-03 | Phase 23 | Complete |
| TEN-04 | Phase 25 | Pending |
| TEN-05 | Phase 25 | Pending |
| SUPER-01 | Phase 26 | Pending |
| SUPER-02 | Phase 26 | Pending |
| SUPER-03 | Phase 26 | Pending |
| SUPER-04 | Phase 26 | Pending |
| SUPER-05 | Phase 30 | Pending |
| CUTOVER-01 | Phase 27 | Pending |
| CUTOVER-02 | Phase 27 | Pending |
| CUTOVER-03 | Phase 27 | Pending |
| PLUGIN-01 | Phase 29 | Pending |
| PLUGIN-02 | Phase 29 | Pending |
| PLUGIN-03 | Phase 29 | Pending |
| RESELL-01 | Phase 30 | Pending |
| RESELL-02 | Phase 30 | Pending |
| RESELL-03 | Phase 30 | Pending |
| RESELL-04 | Phase 30 | Pending |
| RESELL-05 | Phase 30 | Pending |
| RESELL-06 | Phase 30 | Pending |
| VERIFY-01 | Phase 28 | Pending |

**Coverage:** 23/23 v2.0 requirements mapped to Phases 23–30. Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-07-12 — Milestone v2.0 (Multi-Tenant Platform) requirements added, grounded in 4-dimension Fable research pass*
