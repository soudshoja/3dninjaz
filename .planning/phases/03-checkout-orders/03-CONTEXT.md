# Phase 3: Checkout + Orders - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 converts the browsing-and-shopping work of Phase 2 into an actual paid, fulfillable order. It delivers: the `orders` + `order_items` schema and migrations, a `/checkout` page that collects a shipping address and renders PayPal Smart Buttons, server actions that create and capture PayPal orders (with server-side price re-derivation), a post-purchase `/orders/[id]` confirmation page, a nodemailer order-confirmation email template, `/orders` customer history, and the admin order list + detail + status update flow.

No new third-party service is introduced beyond PayPal itself — SMTP is already live from Phase 1, MySQL is already live, and auth/roles are already live. The only new dependency is the `@paypal/react-paypal-js` frontend button SDK + the `@paypal/paypal-server-sdk` server SDK (note: the **paypal-checkout** skill explicitly deprecates `@paypal/checkout-server-sdk`, which CLAUDE.md mistakenly still lists — use the new package).

After this phase, a customer completes the full Browse -> Bag -> Checkout -> Pay -> Confirmation -> Email -> Order history loop. Admin can view every order and move it through pending -> processing -> shipped -> delivered. Cancellations are recorded via the same status enum.

</domain>

<decisions>
## Implementation Decisions

### Vocabulary (locked from Phase 2 D-02)
- **D3-01:** User-facing text is **"bag"** (not cart). The route for the full bag page is `/bag`. Checkout CTA label is **"Checkout"**. Post-purchase messaging uses "order" (not "bag").
- **D3-02:** Unified 3-color palette (Phase 2 D-01): blue `#2563EB`, green `#84CC16`, purple `#8B5CF6`, ink `#0B1020`, cream `#F7FAF4`. Russo One headings, Chakra Petch body. These are the ONLY tokens used on checkout/orders surfaces (customer and admin alike).

### Checkout Flow
- **D3-03:** `/checkout` requires an authenticated session (PAY-01, PROJECT.md constraint: "Account required for purchases — no guest checkout"). Unauthenticated visits redirect to `/login?next=/checkout`.
- **D3-04:** `/checkout` is a client-component-heavy page that composes: a left column with a shipping address form (React Hook Form + Zod, autofills name/email from the session), a right column with an order summary (read from `useCartStore`) and the `<PayPalButtons>` mounted inside a `<PayPalScriptProvider>`. The PayPal buttons stay disabled until the address form passes Zod validation — the button's `createOrder` calls the server with the bag contents + validated address; on success the server returns a PayPal order ID which the SDK opens in its popup.
- **D3-05:** Shipping address fields (all required unless noted): recipient name, phone (Malaysian format — 10-11 digits, optional +60 prefix), address line 1, address line 2 (optional), city, state (dropdown: 13 Malaysian states + 3 FTs), postcode (5 digits), country fixed to "Malaysia". No international shipping in v1.
- **D3-06:** PayPal currency is **MYR**. Verified supported by PayPal REST API for Malaysian-registered accounts. If the provisioned PayPal business account is NOT Malaysian (detected by sandbox error `CURRENCY_NOT_SUPPORTED`), surface the error early in the create-order server action with a human-readable message and log for operator action — DO NOT silently convert to USD.
- **D3-07:** Price validation is server-side and authoritative. The `createOrder` action accepts `{ items: [{ variantId, quantity }] }` from the client — NEVER the unit price. The server re-fetches each variant from the DB, multiplies by quantity, sums to a `subtotal`, and feeds THAT number to PayPal's `purchase_units[0].amount.value`. A client-sent amount is ignored. Shipping + tax are `0.00` in v1 (flat-rate shipping deferred to Phase 4 if needed).
- **D3-08:** When the server creates the PayPal order, it writes a **pending** row to the `orders` table with the PayPal order ID and the snapshot of bag lines to `order_items`. If the user abandons (close popup), the pending row stays pending (surfaces in admin as "abandoned" via `createdAt` > 24h + status=pending). The `capture` action flips status to `paid` only after PayPal returns `COMPLETED`.
- **D3-09:** Order idempotency: the capture endpoint is safe to call twice (webhook + onApprove race). We check `orders.paypalCaptureId` — if non-null, return the existing order row without re-calling PayPal. We also use `prefer: "return=representation"` so we get the capture ID back in one round trip.
- **D3-10:** On successful capture, the server clears the user's cart by returning `{ orderId, redirectTo: "/orders/<id>" }` from the action. The client calls `useCartStore.getState().clear()` BEFORE `router.push(redirectTo)` so the confirmation page renders with an empty bag drawer.

### Data Model
- **D3-11:** Two new tables in `src/lib/db/schema.ts`:
  - `orders` — id varchar(36) PK UUID, userId FK -> user, status mysqlEnum (pending, paid, processing, shipped, delivered, cancelled) default "pending", paypalOrderId varchar(64) unique, paypalCaptureId varchar(64) nullable, subtotal decimal(10,2), shippingCost decimal(10,2) default 0.00, totalAmount decimal(10,2), currency varchar(3) default "MYR", shippingName/phone/addressLine1/addressLine2/city/state/postcode/country varchar, customerEmail varchar (snapshot), notes text nullable (admin-only), createdAt/updatedAt timestamp.
  - `order_items` — id varchar(36) PK UUID, orderId FK -> orders ON DELETE CASCADE, productId varchar(36) (NO FK — products may be deleted; we keep the snapshot), variantId varchar(36) (NO FK for same reason), productName varchar(200) snapshot, productSlug varchar(220) snapshot, productImage text snapshot, size mysqlEnum S/M/L, unitPrice decimal(10,2), quantity int, lineTotal decimal(10,2).
- **D3-12:** Status flow is enforced server-side in `updateOrderStatus(orderId, newStatus)` — allowed transitions: pending -> paid | cancelled; paid -> processing | cancelled; processing -> shipped | cancelled; shipped -> delivered; delivered -> (terminal); cancelled -> (terminal). Out-of-sequence transitions throw. This prevents admin clicks accidentally resurrecting cancelled orders.
- **D3-13:** Snapshot pricing — we deliberately duplicate product name/slug/image/unitPrice into `order_items` so past orders render correctly even if the admin deletes or renames a product. This is the e-commerce default and matches the "keep history immutable" posture already used in Phase 2 for the localStorage cart.

### Post-Purchase
- **D3-14:** `/orders/[id]` (confirmation + detail in one route): reads `orderId`, enforces `session.user.id === order.userId` OR `session.user.role === "admin"`. Renders order number (last 8 of UUID, uppercased), status badge, line items with thumbnails, subtotal, shipping address, shipping status timeline (Ordered / Processing / Shipped / Delivered), and an "Email receipt resent" button (rate-limited to once per 5 minutes via a simple in-memory map keyed by orderId).
- **D3-15:** Confirmation email template lives at `src/lib/email/order-confirmation.ts`, called by `sendOrderConfirmationEmail(orderId)` and invoked automatically AFTER successful capture. It renders an HTML email (simple inline-styled table; React Email is out of scope) with order number, line items, subtotal, shipping address, a link to `/orders/<id>`, and the 3D Ninjaz footer. Sent via the existing `sendMail()` helper in `src/lib/mailer.ts`. A generic text fallback is included.
- **D3-16:** `/orders` (user order history): server component fetching all orders where `userId = session.user.id`, ordered by `createdAt desc`. Shows a list of cards (order #, date, status badge, item count, total). Each card links to `/orders/<id>`. Unauthenticated redirects to `/login?next=/orders`.

### Admin Order Management
- **D3-17:** `/admin/orders` — server component reading all orders with a left-join to `user` for customer email/name. Table columns: Order # (last 8 of UUID), Customer, Date, Items, Total, Status (colored badge), Actions (View). Sortable newest-first by default. Filter chips: All / Pending / Paid / Processing / Shipped / Delivered / Cancelled. Uses `requireAdmin()` from `src/lib/auth-helpers.ts` at page top.
- **D3-18:** `/admin/orders/[id]` — admin order detail with full order info, line items, shipping address, and a `<select>` with allowed next statuses (per D-3-12) + a confirm button. Status update dispatches the `updateOrderStatus` server action. A small notes textarea lets admin add internal notes (stored in `orders.notes`) for future reference.
- **D3-19:** Admin auth is enforced at EVERY mutating entrypoint — `updateOrderStatus`, `updateOrderNotes`, and `listAdminOrders` all call `requireAdmin()` FIRST. Middleware alone is insufficient (CVE-2025-29927).

### Mobile-First (D-04 from Phase 2 reinforced)
- **D3-20:** All checkout/orders surfaces MUST render correctly at 390×844 (iPhone 13) AND 375×667 (iPhone SE). Hard rules:
  - Address form stacks single-column below 640px; two-column (city/postcode paired) on ≥ 640px.
  - PayPal Buttons render full-width on mobile (`layout: "vertical"` in the SDK).
  - Order summary on `/checkout` collapses into a sticky bottom sheet (summary + "Pay with PayPal" trigger) on viewports ≤ 768px — mirrors the Phase 2 drawer-on-mobile pattern.
  - Status badges use ink+green/blue/purple tokens; no tiny icons-only buttons (tap targets ≥ 48px, primary CTAs ≥ 60px).
  - Admin tables horizontally scroll inside their card on mobile rather than breaking layout.
  - No horizontal scroll at 320 / 375 / 390 / 768 / 1024 / 1440.

### Security & Compliance
- **D3-21:** PayPal webhook signature verification is mandatory on `/api/paypal/webhook`. Use the official PayPal "Verify Webhook Signature" API (`POST /v1/notifications/verify-webhook-signature`). If verification fails, return 400 and log — never write to the DB. Webhook secret + webhook ID come from env (`PAYPAL_WEBHOOK_ID`).
- **D3-22:** Order lookup is always gated by session: never expose an order via URL alone. `/orders/[id]` server-component does the auth check; admin bypasses the user-id check but is itself role-gated. This blocks email enumeration via guessed order IDs.
- **D3-23:** PDPA retention: orders + addresses are personal data. v1 retains indefinitely. Phase 4 BRAND-03 delivers the privacy policy and the account deletion/data export flow. Phase 3 MUST log customer email on each order row (snapshot, not a FK) so deletion of a user account does not orphan an order's contact info and so we have a PDPA-visible audit trail. This is out-of-scope for deletion flow but establishes the data shape Phase 4 needs.

### Claude's Discretion
- Exact copy for the confirmation email (keep warm / ninja tone, follow the Phase 2 demo voice).
- Whether to render the address form via `react-hook-form` + `zodResolver` or plain `useState` — `react-hook-form` is already installed, use it.
- Visual arrangement of the order-detail timeline (dots vs progress bar); prefer the simpler one.
- Whether to add an `orders.notes` admin textarea in Wave 4 (D3-18) or cut to scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Skills & Research
- `paypal-checkout/SKILL.md` — CANONICAL PayPal integration reference. IMPORTANT: the skill supersedes CLAUDE.md on the server SDK name — use `@paypal/paypal-server-sdk`, NOT the deprecated `@paypal/checkout-server-sdk`.
- `paypal-checkout/references/rest-api.md` — PayPal Orders v2 REST endpoints (create / capture / refund / webhook verify).

### Stack & Conventions
- `CLAUDE.md` — Next.js 15 App Router, Drizzle mysql2, Better Auth, nodemailer, Zustand, shadcn/ui
- `.planning/phases/01-foundation/01-UI-SPEC.md` — shadcn component list, spacing scale, breakpoints, accessibility rules

### Phase 1 Outputs (dependency surface)
- `src/lib/db/schema.ts` — existing tables (user, session, account, verification, categories, products, product_variants). Phase 3 ADDS `orders` + `order_items` here.
- `src/lib/db/index.ts` — Drizzle client (`db`), relations query API
- `src/lib/auth.ts` — Better Auth server config with admin plugin; `auth.api.getSession({ headers })`
- `src/lib/auth-helpers.ts` — `requireAdmin()` and `getSessionUser()` helpers — reuse in all new server actions
- `src/lib/mailer.ts` — `getMailer()`, `sendMail({ to, subject, html, text })`, `MAIL_FROM` — reuse for order confirmation
- `src/lib/validators.ts` — existing Zod schemas for product/category — extend with `orderAddressSchema` here

### Phase 2 Outputs (dependency surface)
- `src/stores/cart-store.ts` — `useCartStore` Zustand hook. Exposes `items`, `getSubtotal()`, `getItemCount()`, `clear()`, `setDrawerOpen()`. The `items` array is the single source of truth for what the checkout ships to PayPal.
- `src/lib/brand.ts` — `BRAND = { blue, green, purple, ink, cream }`
- `src/lib/format.ts` — `formatMYR()`, `priceRangeMYR()`
- `src/components/ui/drawer.tsx` — shadcn-style Drawer wrapping vaul (reuse for mobile "summary drawer" on /checkout)
- `src/components/store/cart-line-row.tsx` — reusable line row. Can be reused on /checkout summary with `variant="compact"`.
- `src/app/(store)/layout.tsx` — store nav + footer + CartDrawer mounted once
- `src/app/(store)/bag/page.tsx` (after Phase 2 D-02 rename) — checkout CTA currently links to `/checkout`; Phase 3 builds that route

### Project Context
- `.planning/PROJECT.md` — vision, Malaysia market, account-required constraint
- `.planning/REQUIREMENTS.md` — PAY-01…05, ORD-01, ORD-02, ADM-05, ADM-06 detail
- `.planning/ROADMAP.md` — Phase 3 success criteria
- `.planning/phases/02-storefront-cart/DECISIONS.md` — D-01 (unified palette), D-02 (bag vocab), D-04 (mobile-first mandatory)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1 + 2)
- shadcn primitives at `src/components/ui/*` — button, card, input, label, select, badge, dialog, table, form, textarea, separator, skeleton, sonner (toast)
- Drizzle client at `src/lib/db/index.ts` — pool + `db` singleton
- `requireAdmin()` at `src/lib/auth-helpers.ts` — admin gate for server actions
- `sendMail()` at `src/lib/mailer.ts` — nodemailer SMTP send helper
- `useCartStore` at `src/stores/cart-store.ts` — Zustand bag state
- `BRAND` tokens at `src/lib/brand.ts`
- `formatMYR()` at `src/lib/format.ts`
- `CartLineRow` at `src/components/store/cart-line-row.tsx` — reuse for checkout summary
- Drawer at `src/components/ui/drawer.tsx` — reuse for mobile checkout bottom sheet
- Admin layout pattern at `src/app/(admin)/layout.tsx` (created in Phase 1 Plan 03) — reuse for `/admin/orders`

### Established Patterns (continue in Phase 3)
- Server components for data reads; client components only for interactivity
- Route groups: `(store)` for customer, `(admin)` for admin
- Server actions at `src/actions/*.ts` — co-locate by domain (`src/actions/orders.ts`, `src/actions/paypal.ts`)
- Server action files begin with `"use server";` per file, NOT per function
- Handler-level auth on all mutating admin actions — `await requireAdmin()` FIRST (CVE-2025-29927)
- Drizzle `db.query.*` relational API for reads; raw inserts via `db.insert(table).values(...)`
- Zod validation on ALL inputs, even from "trusted" internal pages
- Images stored as relative `/uploads/products/<id>/<file>` — Next Image handles them via the default Next static serve (no `remotePatterns` tweak needed)
- Snapshot strategy — order_items duplicates product name/slug/image so deletes don't break history (D3-13)

### New Patterns Phase 3 Establishes
- PayPal SDK provider singleton — `src/components/store/paypal-provider.tsx` wraps children in `<PayPalScriptProvider>` with a stable `initialOptions` object
- Server-only PayPal client singleton — `src/lib/paypal.ts` exports `getPayPalClient()` returning a cached `@paypal/paypal-server-sdk` `Client` instance (token TTL ~9h; the SDK handles refresh internally)
- API Route Handler pattern for webhooks — `src/app/api/paypal/webhook/route.ts` (the webhook MUST be a route handler, not a server action, because PayPal cannot pass the nonce headers that Next's server-action protocol requires)
- Order email template pattern — HTML string builder in `src/lib/email/order-confirmation.ts` fed through existing `sendMail()`

### Integration Points
- `useCartStore` (client) -> `/checkout` page (client) -> `createPayPalOrder` server action (server) -> `@paypal/paypal-server-sdk` -> PayPal API -> returns order ID -> PayPal popup renders -> buyer approves -> `onApprove` callback -> `capturePayPalOrder` server action -> writes `paid` order, sends email, clears cart, redirects to `/orders/<id>`
- Webhook safety net: `/api/paypal/webhook` receives `PAYMENT.CAPTURE.COMPLETED` and is an idempotent no-op if `orders.paypalCaptureId` is already set (D3-09).
- Admin update path: admin UI form -> `updateOrderStatus` server action -> Drizzle update -> redirect/refresh

</code_context>

<specifics>
## Specific Ideas

- Create `src/lib/paypal.ts` with `getPayPalClient()` and `getPayPalEnvironment()` helpers, reading `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` (sandbox | live) from env. Default to sandbox.
- Add `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` to `.env.local.example` and document them in the user_setup frontmatter of the PayPal-touching plan.
- The `NEXT_PUBLIC_PAYPAL_CLIENT_ID` variant is needed because the client SDK requires the public client ID at build time — same value as server-side `PAYPAL_CLIENT_ID` (client secret stays server-side).
- Order number format: `PN-<last-8-of-UUID-uppercased>` (e.g. `PN-7F3A2B91`). Looks human and matches "Print Ninjaz" -> "PN" badge aesthetic from demo-v2.
- Use `formatMYR()` from Phase 2 everywhere an amount appears.
- Order status badge colors: pending=purple, paid=blue, processing=blue, shipped=green, delivered=green, cancelled=ink (gray-ish). Tint with `bg-<color>/15` + `text-<color>` style.
- Address form state list: Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur (FT), Labuan (FT), Putrajaya (FT). 16 items total.
- Add a `scripts/smoke-paypal.ts` that verifies the sandbox client creds work by requesting a token — optional but cheap insurance.

</specifics>

<deferred>
## Deferred Ideas (NOT to be planned in Phase 3)

- Refunds / order cancellation from PayPal (admin-initiated) — deferred. v1 admin sets status=cancelled but does NOT call PayPal's refund API. Manual refund via PayPal dashboard. Document in README.
- Shipping cost calculation / shipping provider integration — deferred. V1 shipping cost is 0.00 (free shipping for launch promo). Phase 4 or v2 adds flat-rate by state.
- Promo / discount codes — deferred per REQUIREMENTS.md Out of Scope.
- SST tax calculation — deferred; confirm threshold with accountant before launch (STATE.md blocker).
- Email template rich design (React Email) — use inline-styled HTML string for v1. A polished template can come later.
- Customer account deletion / PDPA data export — Phase 4 BRAND-03 owns this.
- FPX / TnG / GrabPay local payments — v2 (LPAY-01…03 per REQUIREMENTS.md).
- SMS order updates — out of scope.
- Admin invoice PDF generation — out of scope.

</deferred>

<open_questions>
## Resolved Open Questions

**Q: Does PayPal's REST API support MYR?**
A: Yes — verified via PayPal REST API currency codes reference. Restriction: MYR is supported only for Malaysian-registered PayPal accounts. This matches the business profile. Plans assume MYR works; the create-order action has a clear error path if `CURRENCY_NOT_SUPPORTED` returns, at which point operator must upgrade the PayPal account to a Malaysian business profile.

**Q: Which PayPal server SDK?**
A: `@paypal/paypal-server-sdk` (per paypal-checkout/SKILL.md). The `@paypal/checkout-server-sdk` referenced in CLAUDE.md is DEPRECATED — do NOT install it. The skill is canonical.

**Q: Guest checkout?**
A: No — PROJECT.md "Account required for purchases" constraint is locked. Checkout redirects unauthenticated visitors to `/login?next=/checkout`.

**Q: Does the order idempotency need a unique index on paypalOrderId?**
A: Yes — `orders.paypalOrderId` is declared UNIQUE in the schema. Duplicate-key errors on retry are caught and mapped to "already captured" logic.

**Q: What happens if PayPal capture succeeds but our DB write fails?**
A: The webhook (PAYMENT.CAPTURE.COMPLETED) is the safety net. It runs server-side with signature verification and reconciles the order — if a user-facing capture failed to persist but PayPal did charge, the webhook writes the paid row idempotently on the ID we already persisted at createOrder time.

**Q: Do we need to verify webhook signatures in v1?**
A: YES — non-negotiable. Skipping signature verification is a P0 security bug. Use PayPal's `POST /v1/notifications/verify-webhook-signature` on every webhook delivery.

**Q: Can an order be deleted?**
A: No. Orders are immutable from the user's perspective. Cancelled is a status, not a deletion. Admin may not delete orders in v1 — only status=cancelled.

**Q: Is there a separate `/bag` -> `/checkout` transition guard, or does `/checkout` just render empty if bag is empty?**
A: `/checkout` checks `useCartStore.getState().items.length === 0` on mount and redirects to `/bag` if empty. Prevents an empty PayPal order attempt.

**Q: Does `/orders` show abandoned pending orders?**
A: Yes, all orders belonging to the user regardless of status. Abandoned carts visible as "pending" let users retry payment. Admin sees them too and may mark as cancelled manually after a reasonable window.

**Q: What counts as "confirmation page immediately after successful payment" (PAY-04)?**
A: `/orders/[id]` rendered with `status=paid` and a success banner is the confirmation page. Same URL serves as permanent order detail — one fewer route to build.

</open_questions>

---

*Phase: 03-checkout-orders*
*Context gathered: 2026-04-16*
