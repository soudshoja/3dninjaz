# Phase 20: Admin POS + Draft Order Flow — Specification

**Created:** 2026-05-17
**Ambiguity score:** 0.186
**Requirements:** 12 locked

## Goal

Admin can build a multi-line order for an offline customer through a new `/admin/pos` surface with a product picker that handles every product type (stocked + variants, configurable, keyboard clicker, free-text), optionally send a tokenized public draft link for the customer to review and pay via PayPal **or** Bank Transfer (with payment-slip upload that queues for admin review), and approve / reject incoming proofs — with all admin order surfaces exposing the existing invoice PDF.

## Background

Phase 7 shipped `/admin/orders/new`: a free-text-only manual order form. It writes a single `customItemName / customItemDescription / customImages` blob to `orders` (no `order_items` rows) and produces a tokenized `/payment-links/[token]` page that renders only the PayPal Smart Button. There is no product picker, no variant or configurator selection, no bank-transfer flow, and no payment-slip upload anywhere in the codebase. Admins can already view every order at `/admin/orders/[id]` and `/admin/payments`; the invoice PDF route (`GET /orders/[id]/invoice.pdf`) is owner-or-admin gated but exposes no admin UI button. The `paymentLinks` table (192-bit token, 30-day TTL), the `requireAdmin()` CVE-2025-29927 pattern, the `writeUpload` / `persistProductImage` image pipeline, and DB-backed `store_settings` (Phase 5 05-04) are all live and reusable.

## Requirements

1. **POS surface (admin order builder)**: Admin can build a multi-line order at `/admin/pos`.
   - Current: `/admin/pos` does not exist. `/admin/orders/new` accepts a single free-text item + amount + customer details.
   - Target: New route `/admin/pos` with a product picker (search by name/SKU) supporting four line types: (a) stocked product + variant, (b) Phase 19 configurable product with configurator fields, (c) keyboard clicker keychain configurator, (d) free-text custom line (name + amount + optional images). Admin can add multiple lines per order, each with its own quantity. Customer details form (name, email optional, phone, shipping address) collected on the same page. Admin autosave per `feedback_admin_autosave_universal` (scoped namespace `admin-pos-draft`).
   - Acceptance: Creating an order at `/admin/pos` with at least one stocked variant + one configurable line + one free-text line produces an `orders` row plus N `order_items` rows (one per line), all with `sourceType='manual'`; `/admin/orders` lists it; `/admin/orders/[id]` renders every line with its variant label / configurationData / free-text name; total = sum of lines.

2. **Real order_items rows for every line**: Manual orders write proper `order_items` rows, not `customItem*` blobs.
   - Current: Phase 7 manual orders write `orders.customItemName/Description/Images` and zero `order_items` rows. `order_items` requires NOT NULL `productId` + `variantId` even though there is no FK.
   - Target: Every POS line becomes one `order_items` row. Stocked/configurable lines snapshot real `productId`, `variantId`, `productName`, `productSlug`, `productImage`, `unitPrice`, `lineTotal`. Free-text lines write a synthetic `productId='manual'` + `variantId='manual'` sentinel with the admin-supplied name + amount. The `customItem*` columns stay populated only as legacy mirror for Phase 7 backwards compatibility (NULL for new POS orders).
   - Acceptance: After creating a 3-line manual order, `SELECT count(*) FROM order_items WHERE order_id=?` returns 3; invoice PDF lists 3 line items with their distinct names / variant labels / configurationData; admin order detail page renders each line identically to a web checkout order.

3. **Order status state machine extension**: Two new statuses added to `orderStatusValues`.
   - Current: Enum is `['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']`.
   - Target: Enum becomes `['pending', 'awaiting_customer', 'awaiting_payment_review', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']`. Transitions: `pending → awaiting_customer` (admin sends draft link), `awaiting_customer → awaiting_payment_review` (customer uploads slip) or `awaiting_customer → paid` (customer pays PayPal), `awaiting_payment_review → paid` (admin approves) or `awaiting_payment_review → awaiting_customer` (admin rejects, customer can re-upload). All existing transitions preserved. Transition guards enforced in a single `assertValidTransition` helper.
   - Acceptance: Enum schema migration applied via raw SQL applicator (drizzle-kit push hangs on remote — Phase 6 precedent). Attempting an invalid transition (e.g. `delivered → pending`) throws and the order row is unchanged. Existing Phase 6 cancel/return logic still works.

4. **Payment method on orders**: Orders carry an explicit `paymentMethod` column.
   - Current: Payment method is implicit (PayPal-only via `paypalOrderId` presence).
   - Target: New column `orders.payment_method` enum `['paypal', 'bank_transfer']` NULL until customer chooses. Set on customer-side choice or admin-side override. Existing rows back-fill to `'paypal'` when `paypalOrderId IS NOT NULL`, else NULL.
   - Acceptance: Column exists; new POS orders default NULL; existing paid PayPal orders show `paypal`; the customer draft page records the chosen method before status transitions.

5. **Payment slip storage**: A new `payment_proofs` table stores customer-uploaded slips with admin moderation state.
   - Current: No payment-proof table or upload UI exists.
   - Target: `payment_proofs` table — `id`, `order_id` FK (ON DELETE CASCADE), `image_url` (relative path under `/uploads/payment-proofs/<orderId>/<uuid>`), `uploaded_by` enum `['customer', 'admin']`, `uploaded_by_user_id` NULL (admin id or NULL for token-uploaded customer), `status` enum `['pending', 'approved', 'rejected']` default `pending`, `admin_note` TEXT NULL, `reviewed_by` user FK NULL, `reviewed_at` timestamp NULL, `created_at`. Uploads reuse `writeUpload` / `persistProductImage` pipeline. Max 10 MB per slip, MIME limited to `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` + `application/pdf`. Storage path is private (not served by `next-cloudinary`-like CDN — served via existing `/uploads/*` route).
   - Acceptance: Customer uploads a 2 MB JPEG via draft link → row appears in `payment_proofs` with `status='pending'`, `uploaded_by='customer'`; file persists at expected path; admin detail page renders thumbnail; uploading a 12 MB file is rejected with a clear error.

6. **Tokenized public draft page**: Customer reviews and pays without an account via the existing `/payment-links/[token]` surface.
   - Current: `/payment-links/[token]` renders only a PayPal Smart Button + free-text item summary; no method picker.
   - Target: Same URL pattern. Page now renders: (a) full item breakdown using `order_items` (variant labels, configurator fields, line totals), shipping address summary, totals; (b) payment-method selector — **PayPal** (existing Smart Button) or **Bank Transfer**; (c) Bank Transfer path displays bank account details from `store_settings`, instructions, and a slip upload form with a Process button; (d) success states: "Payment received" (PayPal) or "Your proof of payment is being reviewed" (bank transfer). Token still 192-bit, 30-day TTL, single-use semantics preserved for PayPal capture but multi-use for bank-transfer flows until status leaves `awaiting_customer`.
   - Acceptance: Opening a fresh draft link shows both payment options; choosing PayPal completes existing capture flow unchanged; choosing Bank Transfer displays editable bank details (read from `store_settings`) + upload UI; uploading a slip moves order to `awaiting_payment_review` and the page swaps to the "being reviewed" state without requiring login.

7. **Admin send-draft prompt**: After creating a POS order, admin is asked whether to send the draft to the customer.
   - Current: No such prompt; admin manually clicks "Generate Payment Link" on `/admin/orders/[id]` afterwards.
   - Target: On `/admin/pos` submit success, admin is shown a confirmation dialog: "Send order to customer for review?" with options **Yes — generate draft link** and **No — keep as pending admin order**. Yes path immediately generates a `paymentLinks` row, sets order status to `awaiting_customer`, copies the URL to clipboard, and shows WhatsApp + email pre-filled deeplink helpers (e.g. `wa.me/<phone>?text=...`). No path leaves status at `pending` for admin to handle manually.
   - Acceptance: Admin completes POS form, clicks Submit, clicks Yes — link is generated, status becomes `awaiting_customer`, dialog shows URL + WhatsApp/email deeplinks. Clicking No leaves status at `pending`.

8. **Admin slip upload (bypass customer)**: Admin can attach a payment slip on behalf of the customer from `/admin/orders/[id]`.
   - Current: Admin has no slip upload UI anywhere.
   - Target: When an order has `paymentMethod='bank_transfer'` (or none yet — admin can mark it), admin sees an "Attach payment slip" section on the order detail page with the same upload pipeline as the customer path. The resulting `payment_proofs` row has `uploaded_by='admin'`, `uploaded_by_user_id=<admin>`, `status='pending'`. Admin can then approve it immediately in the same surface.
   - Acceptance: Admin uploads a slip from `/admin/orders/[id]` for an order without going through the draft link → `payment_proofs` row inserted with admin attribution → admin approves it → order status transitions to `paid`.

9. **Admin payment-review queue**: Admin sees a filterable queue of orders awaiting payment review.
   - Current: `/admin/orders` lists all orders without a "needs payment review" filter.
   - Target: `/admin/orders` gains a status filter chip "Awaiting payment review" (count badge). Sidebar nav gains a count badge for pending payment proofs (reuses the existing `badge` switch pattern from Phase 7 07-06). Each order row in this filter renders a slip-thumbnail preview. Clicking a row goes to `/admin/orders/[id]` where the slip is full-size with **Confirm Payment** and **Reject** buttons. Confirm transitions order to `paid` (triggers existing email + fulfillment side-effects identical to PayPal capture). Reject transitions order back to `awaiting_customer`, sets `payment_proofs.status='rejected'` + optional `admin_note`, and the customer's draft link continues to work for re-upload.
   - Acceptance: An order with a pending proof appears in the filtered queue; sidebar shows badge "1"; clicking Confirm moves order to `paid` and removes it from the queue; clicking Reject moves it back to `awaiting_customer` and the customer can re-open the same draft link to upload again.

10. **Bank details in store settings**: Bank-transfer instructions live in `store_settings` (admin-editable, no redeploy).
    - Current: `store_settings` exists (Phase 5 05-04) with business name / contact / WhatsApp / socials. No bank fields.
    - Target: Three new columns on `store_settings`: `bank_name` (varchar 100), `bank_account_number` (varchar 50), `bank_account_holder` (varchar 200). All NULL by default. Edited via `/admin/settings`. Surfaced to customer ONLY on the bank-transfer branch of the draft page. Never shown to anonymous visitors at `/admin/settings`.
    - Acceptance: Admin sets all three fields at `/admin/settings`; bank-transfer branch of `/payment-links/[token]` renders them in a copy-to-clipboard block; admin clearing the fields hides the bank-transfer option from the draft page (UI guard).

11. **Admin invoice button**: Admin order detail page exposes a "Download Invoice" link.
    - Current: Invoice route `/orders/[id]/invoice.pdf` is admin-accessible via direct URL but no UI button exists on admin surfaces.
    - Target: `/admin/orders/[id]` adds a "Download Invoice (PDF)" button that opens the existing invoice PDF route in a new tab. Works for every order including manual / POS / bank-transfer orders.
    - Acceptance: Admin clicks "Download Invoice" on any order → existing `/orders/[id]/invoice.pdf` route serves the PDF with the same Cache-Control: private, no-store headers + per-user rate limit unchanged.

12. **Auth + CVE-2025-29927 mitigation**: Every new admin server action awaits `requireAdmin()` as the first await.
    - Current: All Phase 5/6/7 admin actions follow this pattern; Better Auth role check + first-await is the project standard.
    - Target: All new server actions in `src/actions/admin-pos.ts`, `src/actions/admin-payment-proofs.ts`, and any new draft-link or settings actions follow the same handler-level pattern. The public token-upload action (customer-side) does NOT require login but MUST validate the token + check that the order is still in `awaiting_customer`.
    - Acceptance: Grep across new server actions confirms `await requireAdmin()` (or for public ones: token validation) is the first await. A non-admin authenticated user calling any admin action gets `Unauthorized`. A revoked / used / expired token cannot upload a slip.

## Boundaries

**In scope:**
- New `/admin/pos` multi-line order builder UI (product search, variant/configurator picker, free-text line, customer details, admin autosave)
- Schema additions: 2 new statuses, `payment_method` enum, `payment_proofs` table, 3 new `store_settings` columns
- Real `order_items` rows for all manual orders (replaces single-`customItem*` model for new orders only)
- Extended `/payment-links/[token]` page with PayPal **or** Bank Transfer flow + slip upload
- Admin send-draft prompt + WhatsApp/email deeplink helpers
- Admin slip upload from `/admin/orders/[id]`
- Admin payment-review queue (filter on existing `/admin/orders` + sidebar badge + Confirm/Reject buttons)
- Admin "Download Invoice" button on `/admin/orders/[id]`
- Bank details editable at `/admin/settings`; rendered to customer only on bank-transfer branch
- Admin autosave for the POS builder (scoped namespace, no customer-side autosave)
- All new admin actions first-await `requireAdmin()`; public token actions validate token

**Out of scope:**
- Auto-OCR / auto-verification of payment slip content — admin review is the only verification (manual judgement)
- Cash on delivery (COD) as a third payment method — bank transfer + PayPal cover v1
- Storefront cart → bank-transfer payment — bank transfer is admin-POS-only for now (web checkout stays PayPal-only)
- POS hardware integration (barcode scanner, receipt printer, cash drawer) — software-only POS
- Staff role separation — only `role='admin'` users can use POS; staff/cashier role is a future phase
- Customer-initiated decline / change-request UI on draft page — review-and-pay-or-walk-away only (admin re-edits via /admin/pos if customer asks)
- Customer-side draft autosave — no customer autosave anywhere per `feedback_no_customer_autosave`
- Notification fan-out (email/WhatsApp to admin on slip upload) — admin queue badge + manual refresh only for v1
- PayPal Reporting reconciliation extension for bank-transfer orders — recon is PayPal-only; bank-transfer payments do not flow through reconciliation
- Refund flow for bank-transfer orders — existing `/admin/payments/[orderId]` PayPal refund tooling does not cover bank transfers; manual refund out-of-band for v1

## Constraints

- MariaDB 10.11 no-LATERAL rule: schema migrations applied via raw-SQL applicator (drizzle-kit push hangs); reads use manual multi-query hydration (Phase 6 06-01 precedent).
- JSON columns stored as LONGTEXT; mysql2 does not auto-parse — any JSON read must go through `ensureJsonArray` / equivalent helper.
- App-generated UUIDs (`crypto.randomUUID()`) for all new tables.
- Image upload pipeline must use `persistProductImage` / `resolveProductImage` (see memory `project_image_pipeline_unified`); no `isomorphic-dompurify` (memory: ESM/CJS incompatibility, replaced by `src/lib/sanitize.ts`).
- Payment slip file constraints: max 10 MB, MIME allowlist `image/jpeg|png|webp|heic|heif` + `application/pdf`, stored under `public/uploads/payment-proofs/<orderId>/<uuid>` with `Cache-Control: private, no-store` semantics.
- Every admin server action must await `requireAdmin()` first (CVE-2025-29927); cross-origin POSTs to admin actions require `trustedOrigins` membership in `src/lib/auth.ts` (Better Auth quirk).
- Public token-upload server action must validate (token exists, not expired, not used, order status = `awaiting_customer`) before any DB write or file write.
- Brand palette per CLAUDE.md (blue / green / purple / ink / cream); tap targets ≥48 px secondary, ≥60 px primary; mobile-first (POS likely used on a phone).
- No new external dependencies beyond what is already locked in CLAUDE.md tech-stack table.
- Self-hosted infrastructure only — no Cloudinary, no Resend, no Neon.

## Acceptance Criteria

- [ ] `/admin/pos` renders for admin users only (non-admin and unauthenticated users get redirected/blocked) and supports adding stocked + configurable + keyboard-clicker + free-text lines in the same order.
- [ ] Submitting `/admin/pos` writes one `orders` row + N `order_items` rows (one per line) with `sourceType='manual'`, full snapshot fields, and totals matching the sum of line totals.
- [ ] The status enum migration applies cleanly on the live MariaDB schema and the two new statuses are accepted by `assertValidTransition` for their defined edges only.
- [ ] `orders.payment_method` column exists and is nullable; existing paid PayPal orders back-fill to `'paypal'`; new POS orders are NULL until customer chooses.
- [ ] `payment_proofs` table exists with documented columns; uploading a 2 MB JPEG via draft link creates a row with `status='pending'`, `uploaded_by='customer'`, and the file persists at `public/uploads/payment-proofs/<orderId>/<uuid>`.
- [ ] `/payment-links/[token]` displays both PayPal and Bank Transfer options on a fresh `awaiting_customer` order; PayPal path completes unchanged; Bank Transfer path displays bank details from `store_settings` and accepts a slip upload.
- [ ] After admin clicks Submit on `/admin/pos` then Yes on "Send to customer?", the order transitions to `awaiting_customer`, a `paymentLinks` row is created, and the URL is copyable + has working WhatsApp + email deeplinks.
- [ ] Admin can upload a slip on `/admin/orders/[id]` for a bank-transfer order and approve it in the same surface; status transitions to `paid` after approval; existing post-payment side-effects (email, fulfillment hooks) fire identically to PayPal capture.
- [ ] `/admin/orders` filter "Awaiting payment review" shows only orders in that status; sidebar count badge matches the row count; Confirm Payment moves the order to `paid` and removes it from the queue; Reject moves it back to `awaiting_customer` and the customer's draft link can be re-used for re-upload.
- [ ] `/admin/settings` saves bank name / account number / account holder; clearing all three hides the Bank Transfer option on every draft page (UI guard).
- [ ] "Download Invoice (PDF)" button on `/admin/orders/[id]` opens `/orders/[id]/invoice.pdf` in a new tab and the PDF lists every `order_items` line with name / variant label / configurationData.
- [ ] Every new admin server action begins with `await requireAdmin()` (grep verified); the public token-upload action rejects expired / used / wrong-status tokens with a non-200 response and never writes to disk in those cases.
- [ ] File upload caps enforced server-side: a 12 MB JPEG and a 1 MB MP4 are both rejected with clear error messages; size limit and MIME allowlist match the constraint section.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                       |
|--------------------|-------|------|--------|-------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | One sentence + concrete surfaces                            |
| Boundary Clarity   | 0.82  | 0.70 | ✓      | Explicit in/out lists with reasons                          |
| Constraint Clarity | 0.75  | 0.65 | ✓      | MariaDB quirks, auth pattern, file caps, deps               |
| Acceptance Criteria| 0.72  | 0.70 | ✓      | 13 pass/fail criteria                                        |
| **Ambiguity**      | 0.186 | ≤0.20| ✓      |                                                             |

## Interview Log

| Round | Perspective       | Question summary                                                          | Decision locked                                                                                                                                                       |
|-------|-------------------|---------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Pre   | Pre-spec Q&A      | Customer access to draft + product types + scope path                     | Tokenized public link; all product types (stocked + configurable + keyboard clicker + free-text); run /gsd-spec-phase to lock scope                                   |
| 1     | Researcher        | Real order_items or reuse customItem* blob?                               | Real order_items rows for every line (free-text uses `productId='manual'` sentinel); customItem* legacy-mirror only for Phase 7 back-compat                            |
| 1     | Boundary Keeper   | New /admin/pos surface or extend /admin/orders/new?                       | New /admin/pos; legacy /admin/orders/new stays as quick free-text shortcut                                                                                            |
| 1     | Boundary Keeper   | Bank details — store_settings, hardcoded, or out-of-band?                 | Editable in /admin/settings; rendered to customer only on bank-transfer branch                                                                                        |
| 2     | Simplifier        | Order state machine for draft + slip flow                                 | Add 2 new statuses (`awaiting_customer`, `awaiting_payment_review`) to existing enum; no separate payment_status column                                                |
| 2     | Boundary Keeper   | Slip upload — auto-approve or queue for admin?                            | Always queue for admin review; admin Confirm / Reject buttons; reject puts order back to `awaiting_customer` for re-upload                                            |
| 2     | Simplifier        | Customer power on draft — modify/decline or review-only?                  | Review-and-pay-or-walk-away only; no decline UI; customer contacts admin via WhatsApp if changes needed                                                               |

---

*Phase: 20-admin-pos-draft-order-flow*
*Spec created: 2026-05-17*
*Next step: /gsd-discuss-phase 20 — implementation decisions (schema migration sequence, PaymentLinkIsland refactor, file upload surface design, admin queue UX, slip-thumbnail rendering, etc.)*
