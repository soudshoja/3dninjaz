# Phase 6: Customer Account - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Depends on:** Phase 3 (orders schema, getMyOrder pattern, formatOrderNumber, addressSchema), Phase 4 (business-info.ts, unified palette, SiteNav), Phase 5 (reviews table + moderation queue, user.suspended/banned flag, coupon schema, storeSettings DB-backed)

<domain>
## Phase Boundary

Phase 6 converts the logged-in customer surface from "order list + detail only" (Phase 3) into a full self-service account. Eight features land — all customer-side, with a single admin touch (approve/reject cancel-return requests) piggybacked onto the existing `/admin/orders/[id]` page.

**The eight features:**

1. **`/account` profile** — server component showing name, email, joinDate, totalOrders. Loyalty/wallet points deferred — show `0 points` badge with "coming soon" copy (keeps the layout grid stable so a future points engine slots in without redesign).
2. **`/account/security`** — change email (triggers Better Auth `changeEmail` + verification flow) and change password (`changePassword` with currentPassword challenge).
3. **Saved addresses** — `/account/addresses` CRUD with mark-default. `/checkout` gets an address dropdown + "use new address" radio; existing single-form checkout still works as fallback.
4. **Wishlist** — `/account/wishlist`. Add-to-wishlist heart button on PDP + shop product card (filled = in wishlist). Remove + Add-to-bag shortcut on the wishlist page.
5. **Product reviews** — star rating 1-5 + text review, **buyer-only** (user must have an order containing the product with status in paid/processing/shipped/delivered). Form on `/orders/[id]` ("Review this item" per line item). Review `status='pending'` until admin approves via Phase 5 moderation queue. PDP shows approved reviews + avg rating badge.
6. **PDF invoice** — `/orders/[id]/invoice.pdf` server route uses **`@react-pdf/renderer`** (React components → PDF, no headless browser required, works on cPanel Node). Order number, date, snapshot shipping address, line items with sizes, subtotal/shipping/total, payment status, business footer from `business-info.ts` (or `getStoreSettings()` if Phase 5 05-04 has shipped first).
7. **Cancel / return requests** — new `order_requests` table. Cancel button on `/orders/[id]` when status ∈ (pending, paid) AND not shipped; Return button when status=delivered AND delivered within 14 days. Submit flow: reason textarea → `pending` request → admin sees `OrderRequestsBadge` on `/admin/orders/[id]` + approve/reject buttons.
8. **Account closure** — `/account/close`. Soft-deletes: `user.deletedAt = now()`, email rewritten to `deleted-<id>@3dninjaz.local`, `emailVerified=false`, `banned=true`. Orders preserved (PDPA D-06 7y retention; snapshot email on orders already survives). Session invalidated. A `deleted` guard on login blocks re-use.

**Zero new external third-party service.** Stack stays on already-wired pieces:
- MariaDB 10.11 via Drizzle (manual hydration, JSON-as-LONGTEXT, no LATERAL joins)
- Better Auth native APIs (`changeEmail`, `changePassword`, `verifyEmail`, admin plugin `banned`)
- Nodemailer via cPanel SMTP (verification emails via Better Auth hooks → existing `sendMail`)
- shadcn/ui + Tailwind v4 + unified palette (D-01)
- `@react-pdf/renderer` (NEW dep added in 06-01) — pure React, serverless-friendly

## Integration Points (existing codebase)

**Shell & nav:**
- `src/components/store/site-nav.tsx` + `src/components/auth/user-nav.tsx` — extend UserNav dropdown with `/account`, `/account/addresses`, `/account/wishlist`, `/account/security`, plus existing `/orders`. Add mobile disclosure entries in site-nav's mobile panel.
- `src/app/(store)/layout.tsx` — no changes; existing wrapper is fine.
- New `src/app/(store)/account/layout.tsx` — account shell with sidebar (desktop) + horizontal chip strip (mobile), mirroring `src/app/(admin)/layout.tsx` pattern.

**Schema extensions (single migration in 06-01):**
- New tables: `addresses`, `wishlists`, `order_requests`
- Add columns to `user`: `deletedAt timestamp NULL` (soft-delete marker for T-06-X-PDPA closure)
- Reviews table is OWNED by Phase 5 (05-01) — Phase 6 plans CONSUME it, not extend it. Phase 5 already ships `reviews` with (id, productId, userId, rating, body, status, createdAt, updatedAt) + admin moderation queue.
- No changes to products/variants/orders/order_items.

**Reused helpers:**
- `src/lib/auth-helpers.ts` — add `requireUser()` sibling of `requireAdmin()`; customer-scoped actions call it as FIRST await (T-06-X-auth, CVE-2025-29927 pattern).
- `src/lib/validators.ts` — extend with addressBookSchema, wishlistAddSchema, reviewSubmitSchema (forward-compat schema from Phase 5 05-01 already exists), orderRequestSchema, accountCloseSchema, profileUpdateSchema, changeEmailSchema, changePasswordSchema.
- `src/actions/orders.ts` — extend `getMyOrder` consumers; reuse ownership gate pattern.
- `src/lib/orders.ts` — `formatOrderNumber` reused for PDF invoice number.
- `src/lib/brand.ts` — BRAND tokens for PDF styling (react-pdf accepts inline style objects).
- `src/lib/format.ts` — `formatMYR` for invoice totals.
- `src/lib/business-info.ts` OR `getStoreSettings()` (if Phase 5 05-04 shipped) — business name, contact email, WhatsApp for PDF footer.
- `src/lib/email/order-confirmation.ts` — `escapeHtml` pattern reused for any HTML rendered around reviews.
- `src/lib/mailer.ts` — `sendMail` used indirectly via Better Auth email-change verification hook.

**Customer routes (all under `src/app/(store)/account/`):**
- `layout.tsx` (shell with sidebar)
- `page.tsx` (profile overview)
- `security/page.tsx` (change email/password)
- `addresses/page.tsx` (list) + `addresses/new/page.tsx` + `addresses/[id]/edit/page.tsx`
- `wishlist/page.tsx`
- `close/page.tsx` (danger-zone form)

**Order-detail touches:**
- `src/app/(store)/orders/[id]/page.tsx` — add ReviewCTA (per item), CancelButton, ReturnButton, DownloadInvoiceButton. Existing structure preserved; append sections.
- `src/app/(store)/orders/[id]/invoice.pdf/route.ts` — NEW route handler rendering `@react-pdf/renderer` streamed to Response.

**Storefront review display:**
- `src/app/(store)/products/[slug]/page.tsx` — append approved reviews list + avg rating badge. Reviews hydrated server-side (manual hydration, MariaDB no-LATERAL).
- `src/components/store/product-card.tsx` — small wishlist heart button in top-right of card (INSIDE the card link's sibling — wishlist toggle must NOT trigger product-link navigation; use `e.preventDefault(); e.stopPropagation()`).

**Checkout integration (non-breaking):**
- `src/app/(store)/checkout/page.tsx` + `src/components/checkout/address-form.tsx` — add address dropdown ABOVE the existing form. If user has ≥1 saved address, default to the `isDefault` one; "Use a new address" radio reveals the existing form. If zero addresses, existing form is the only path (no regression).

**Admin touches (minimal):**
- `src/app/(admin)/admin/orders/[id]/page.tsx` — render `OrderRequestsList` section. Each pending request shows reason + approve/reject buttons (server actions in `src/actions/admin-order-requests.ts`).
- `src/components/admin/order-requests-badge.tsx` — count badge on the admin orders list row if pending requests exist.

## Assumptions (verify with user in open questions)

1. **Loyalty/wallet points = deferred with visible placeholder.** Show a card on `/account` that says "Loyalty points: 0 — earning launches soon." No engine, no accrual. Prevents a future engine from requiring a redesign of the profile layout.
2. **Review buyer-only rule is strict.** The product must appear in an `order_items` row tied to an `orders` row owned by the user with status IN ('paid', 'processing', 'shipped', 'delivered'). Cancelled + pending buyers cannot review. One review per (user, product) lifetime — enforced by UNIQUE (user_id, product_id) on reviews.
3. **Review edit window = none in v1.** Once submitted, the customer cannot edit or delete. Admin moderation is the only mutation path. Simpler flow; avoids the "I changed my mind" abuse vector. Future v2 can add a 15-minute edit window if demanded.
4. **Invoice PDF on ANY status.** PDP says "download invoice" for any order including `pending` (useful pre-payment), but the PDF body includes status so ambiguity is self-documented. `cancelled` orders still generate a PDF with "CANCELLED" watermark.
5. **Cancel approval workflow = manual admin.** Submitting a cancel request does NOT auto-transition the order. Admin must approve → order.status → 'cancelled'. Reject → leaves order status untouched. Keeps PayPal refund outside the system (admin handles in PayPal dashboard; internal status reflects final state). This avoids implementing a refund engine in Phase 6.
6. **Return approval workflow = manual admin.** Similarly manual. Return approved sets `order_requests.status='approved'` and records `resolvedAt`; does NOT add a special order status (orders stay at 'delivered'). Admin logs refund out-of-band via PayPal and optionally posts a note on the order.
7. **One pending request per order.** DB unique constraint on (orderId, status='pending') — enforced at app layer (MariaDB doesn't support partial unique indexes cleanly). Plan action checks `EXISTS pending request` before allowing new submit; returns "You already have a pending request on this order."
8. **Address cap = 10 per user.** Prevents enumeration abuse / address-table bloat. Return friendly error when the 11th is attempted.
9. **Address delete with orders — allowed.** Addresses are a customer convenience; order.shippingName/Line1/etc. are snapshots (already in schema from Phase 3). Deleting an address does NOT affect historical orders.
10. **Wishlist = simple join table.** (user_id, product_id, created_at) with composite unique. Toggle semantics: POST add (idempotent), DELETE remove. No private/public flag, no sharing link.
11. **Account closure timing = immediate soft-delete.** No grace period, no 30-day recovery window. Closure triggers: anonymize email, set deletedAt, banned=true, invalidate sessions via Better Auth admin plugin banUser. Re-registration with original email is blocked by the anonymized email sitting in the user table (unique index on email holds). User would need to register with a different email if they came back.
12. **PDF footer company block.** Pull from `business-info.ts` static BUSINESS const in v1. If Phase 5 05-04 ships `getStoreSettings()` before 06-06, switch to that at implementation time. Either source works — the PDF needs: business name, contact email, WhatsApp link, PDPA notice line ("This is a digital invoice; no signature required.").
13. **Review-on-PDP limit = most-recent 10 approved, with avg rating from ALL approved.** Avoid loading hundreds of reviews. If hot demand, Phase 7+ adds pagination.
14. **Email change flow = Better Auth's `changeEmail` with verification.** Better Auth's native flow emails a verification link to the NEW email (not the old). User clicks → email is updated. If the verification link sits unused, the old email stays active. We lean entirely on the library.
15. **Password change flow = Better Auth's `changePassword` with `currentPassword` challenge.** No email notification in v1 (Better Auth doesn't ship that out of the box). Future enhancement: send "your password was changed" email via a custom hook — deferred.

## Dependency on Phase 5

Phase 6 DEPENDS on Phase 5 deliverables being in place at execution time:

| Phase 5 Artifact | Consumed by Phase 6 Plan |
|------------------|--------------------------|
| `reviews` table (Phase 5 05-01) | 06-05 (reviews submit + PDP display) |
| `/admin/reviews` moderation queue (Phase 5 05-07) | 06-05 (expects pending reviews land here) |
| `user.banned` field | 06-07 (account closure uses Better Auth admin plugin banUser) |
| `store_settings` + `getStoreSettings()` (Phase 5 05-04) | 06-06 (preferred over static business-info.ts if available) |

**Coordination note:** If Phase 6 planning completes before Phase 5 execution is done, 06-01 migration must check for the existence of `reviews` table BEFORE creating (use `CREATE TABLE IF NOT EXISTS` or drizzle-kit push idempotency). Do NOT recreate. Phase 5 06-01 summary should confirm the table shape before Phase 6 starts execution.

**Fallback if Phase 5 slips:** Phase 6 05-01 migration adds the `reviews` table itself using the shape documented in Phase 5 05-01 CONTEXT (rating int 1-5, body text, status enum pending|approved|hidden, user_id + product_id FKs), but includes a comment: "OWNED BY Phase 5 — if that migration runs first, this CREATE is a no-op via IF NOT EXISTS."

## Out of Scope (explicit — do NOT plan)

- Social login / OAuth account linking (already out of scope per REQUIREMENTS.md)
- Two-factor auth on customer accounts (admin may add later)
- Wishlist sharing / public wishlist URLs
- Review images / photo uploads
- Review reply from admin (deferred — admin moderation is approve/hide/delete only)
- Review voting / helpfulness
- Bulk address import from Google contacts
- Auto-fill address via postcode lookup API (MY postcode service exists but adds an external dep)
- Refund automation via PayPal API (manual admin action in v1)
- Return shipping label generation
- Gift cards / store credit (separate system)
- Customer CSV data export (PDPA right-to-data-portability) — deferred; email request to DPO covers it
- Delete individual orders from customer-side (PDPA retention 7y overrides; customers cannot delete)
- Multi-language review UI (English only per BRAND constraints)
- Review spam / captcha — buyer-gate already blocks non-customers; admin moderation catches the rest
- Loyalty points accrual engine — UI placeholder only (per Assumption 1)

</domain>

<open_questions>
## Open Questions (for user before/during execution)

**Q-06-01: Loyalty points scope.** Are we building ANY engine in Phase 6 or strictly UI placeholder?
→ Claude's guess: UI placeholder only. Profile shows "Loyalty points: 0 — earning launches soon." No DB column, no accrual logic. If user wants a real engine, it's a new phase.

**Q-06-02: Review buyer rule — include `cancelled` orders?**
→ Claude's guess: NO. Buyer must have status IN (paid, processing, shipped, delivered). Cancelled means they didn't actually receive the product. Pending = didn't even pay. If user wants to allow cancelled-order reviewers (e.g. "product was fine but I cancelled for personal reasons"), relax to include 'cancelled'. Confirm.

**Q-06-03: Invoice company footer source.** Pull from static `src/lib/business-info.ts` BUSINESS const OR from `getStoreSettings()` DB row (Phase 5 05-04)?
→ Claude's guess: Prefer `getStoreSettings()` if 05-04 is merged at 06-06 execution time; else fall back to BUSINESS. 06-06 task action reads both paths and picks whichever exists.

**Q-06-04: Cancel/return approval workflow — auto or manual?**
→ Claude's guess: MANUAL. Cancel approved → admin action sets order.status='cancelled'. Return approved → order_requests.status='approved' + resolvedAt set (order stays 'delivered'). No auto-transition on submit. Admin handles refund out-of-band in PayPal dashboard. Rationale: v1 avoids building a refund engine. Confirm.

**Q-06-05: Return window of 14 days — counted from `orders.updatedAt` or a tracked delivered-at timestamp?**
→ Claude's guess: Count from `orders.updatedAt` at the point status transitioned to 'delivered'. Since Phase 3's `updatedAt` is `.onUpdateNow()`, it captures the last status update; if admin moves pending→delivered in one step (edge case), the timestamp is still accurate. If admin later edits internal notes, `updatedAt` refreshes — that's a known limitation; acceptable for v1. Alternative: add a `deliveredAt` column. Confirm.

**Q-06-06: Account closure — what happens to pending wishlist / addresses / reviews?**
→ Claude's guess: Closure cascade: DELETE rows from wishlists + addresses (customer-only data, no audit value). Reviews KEEP (anonymized: reviewer name shows "Former customer" on PDP; reviews.userId FK has NO cascade, user row lingers with anonymized email). Orders + order_requests KEEP (PDPA D-06 7y retention; customerEmail snapshot already on orders; user row lingers with anonymized email so admin user lookup still resolves). Confirm.

**Q-06-07: Re-registration with same email after closure.** Since user.email is UNIQUE and closure anonymizes to `deleted-<id>@3dninjaz.local`, the ORIGINAL email becomes free for re-registration. Customer can re-create an account with original email. Is that desired (yes by default), or should we block re-registration entirely (anti-abuse)?
→ Claude's guess: Allow re-registration. Anonymizing the original email frees it. Customer gets a fresh account. Orders remain attached to the original (now-anonymized) user row and are not visible to the new account. Confirm.

**Q-06-08: Wishlist — does ADD require authentication or can we use localStorage first?**
→ Claude's guess: Requires auth. Heart button on unauth visitor → redirect to `/login?next=<current_url>`. Matches existing "account required for purchase" posture. No localStorage wishlist (avoids merge-on-login complexity). Confirm.

</open_questions>

<canonical_refs>
## Canonical References

### Existing Codebase (MUST read before modifying)
- `src/lib/auth.ts` — Better Auth config; admin plugin with `banned` field
- `src/lib/auth-helpers.ts` — `requireAdmin()` + `getSessionUser()` patterns
- `src/lib/db/schema.ts` — existing tables (user, session, orders, order_items, products, product_variants, categories)
- `src/actions/orders.ts` — `getMyOrder` ownership gate pattern (T-03-21)
- `src/actions/admin-orders.ts` — admin action pattern (requireAdmin first, manual hydration)
- `src/lib/orders.ts` — `formatOrderNumber`, state-machine helpers
- `src/lib/brand.ts` — BRAND palette
- `src/lib/format.ts` — `formatMYR`
- `src/lib/business-info.ts` — BUSINESS const (source for PDF footer in v1)
- `src/lib/validators.ts` — `MALAYSIAN_STATES`, `orderAddressSchema`, `reviewSubmitSchema` (Phase 5 05-01)
- `src/lib/email/order-confirmation.ts` — `escapeHtml` pattern
- `src/app/(store)/orders/[id]/page.tsx` — layout to extend with review CTAs + cancel/return buttons + invoice button
- `src/app/(store)/products/[slug]/page.tsx` — PDP to extend with reviews list
- `src/app/(store)/checkout/page.tsx` + `src/components/checkout/address-form.tsx` — to extend with address dropdown
- `src/components/store/site-nav.tsx` + `src/components/auth/user-nav.tsx` — to extend with /account entries
- `.planning/phases/02-storefront-cart/DECISIONS.md` — D-01 palette, D-02 bag vocabulary, D-04 mobile hard rules
- `.planning/phases/03-checkout-orders/03-01-SUMMARY.md` — orders schema, state machine
- `.planning/phases/03-checkout-orders/03-03-SUMMARY.md` — getMyOrder / listMyOrders patterns
- `.planning/phases/04-brand-launch/DECISIONS.md` — D-04 DPO mail, D-06 retention
- `.planning/phases/05-admin-extensions/05-CONTEXT.md` — reviews table shape, admin moderation queue

### Libraries (new dep — install in 06-01)
- `@react-pdf/renderer` (latest) — PDF generation via React components. Pure JS, no Puppeteer / headless browser. Works on cPanel Node. Supports Text, View, Image, StyleSheet.create.

### Threat Model Anchors
- T-03-21 baseline: IDOR / enumeration — return notFound() not 403 for mismatched ownership
- T-03-30 baseline: `requireUser()` / `requireAdmin()` as FIRST await — CVE-2025-29927
- T-06-X-review-fraud: buyer-gate EXISTS subquery on order_items
- T-06-X-rate-limit: invoice (10/user/hour), review submit (1/product/user lifetime), cancel/return (1 pending per order)
- T-06-X-PDPA: account deletion anonymizes user row, retains orders per D-06

</canonical_refs>
