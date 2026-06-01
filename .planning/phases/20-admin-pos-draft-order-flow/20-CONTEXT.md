# Phase 20: Admin POS + Draft Order Flow - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin-side POS (`/admin/pos`) that builds multi-line orders for offline customers across all product types (stocked + variants, configurable, keyboard clicker, free-text), generates a tokenized public draft link customers open to review and pay via PayPal **or** Bank Transfer with payment-slip upload, and routes uploaded slips into an admin moderation queue exposed via `/admin/orders/[id]`. Adds explicit admin "Download Invoice" affordance.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**12 requirements are locked.** See `20-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `20-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
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

**Out of scope (from SPEC.md):** Auto-OCR / slip verification; cash on delivery; storefront-cart bank-transfer; POS hardware; staff role; customer-side decline/change UI; customer draft autosave; admin-fanout notifications on slip upload; PayPal Reporting recon extension for bank transfer; refund flow for bank transfers.

</spec_lock>

<decisions>
## Implementation Decisions

### POS builder UX
- **D-01 — Picker style:** Single global type-ahead combobox on `/admin/pos`. Results show product name + type icon (stocked / configurable / clicker). A "+ Add custom (free-text) line" button sits below the search box. Admin can add multiple lines per order; each line renders as its own row.
- **D-02 — Configurator placement:** Configurable / keyboard-clicker lines render their configurator fields **inline within the line row** (row-expansion pattern, mirroring `variant-editor.tsx`). Picking a configurable product expands the row to show all `product_config_fields` for that product. Submitting POS validates every expanded line before committing.
- **D-03 — Admin price override:** Each line row exposes an editable `unitPrice` input that pre-fills with the computed (variant/tier-table/list) price. Admin can override on a per-line basis; the override is snapshotted on the resulting `order_items` row. No audit-log row beyond the snapshot itself — the admin user is implicit via `orders.userId`.
- **D-04 — Coupon application on POS:** Admin can apply an existing customer-facing coupon code at POS submission time, on behalf of the customer. Reuses the existing Phase 5 coupon validator + atomic redemption pattern (`UPDATE coupons SET usage_count = usage_count + 1 WHERE id = ? AND (usage_cap IS NULL OR usage_count < usage_cap)`). Discount renders as a separate `-RM x.xx` line on the totals breakdown and on the invoice. Coupon `customId` thread-through (e.g. `COUPON:CODE`) does not apply here because there is no PayPal capture flow for the redemption — atomic UPDATE is the only redemption side-effect.
- **D-05 — Shipping cost at POS:** Reuse existing `getShippingRate(state, subtotal)` to pre-fill shipping. Admin can override the shipping amount field (same override pattern as line price). Free-ship threshold + flat per-state rates from Phase 5 still apply by default.

### order_items schema accommodation
- **D-06 — Manual line FK sentinel:** Keep `order_items.productId` and `order_items.variantId` as `NOT NULL` (no migration). Free-text manual lines write the literal string `'manual'` to both columns. The sentinel is **non-UUID-shaped** so it cannot collide with a real product id (real ids are UUID v4). No `products.id='manual'` row will ever exist.
- **D-07 — Discriminator pattern:** No new column. Every read site that links to `/products/<id>` or fetches from `products` table MUST check `isManualLine(item)` first. Helper `isManualLine(item: OrderItem) => item.productId === 'manual'` lives in `src/lib/orders.ts` (co-located with `assertValidTransition`). Storefront product listing queries (`getActiveProducts`, `/shop`) already filter on `products.is_active` and `products` table membership — sentinel is invisible to all storefront/admin-product surfaces by construction.
- **D-08 — Render guards:** Order detail (admin + customer), invoice PDF, and order-confirmation email MUST render manual lines using `item.productName` + `item.unitPrice` + `item.configurationData` (if any) directly. No `/products/<id>` link, no product-image fetch, no variant lookup. The product-image-pickImage fallback continues to render an "Item" placeholder when `item.productImage` is null.

### Slip upload + admin review surface
- **D-09 — New writePaymentProof helper:** New module `src/lib/payment-proof-storage.ts` exposes `writePaymentProof(orderId, file) -> { url, thumbnailUrl, sizeBytes, mimeType }`. Stores the original under `public/uploads/payment-proofs/<orderId>/<uuid>.<ext>` (extension preserved). For image inputs, generates a 256px-wide thumbnail at `<uuid>.thumb.webp` using `sharp`. EXIF is stripped (Sharp `.rotate().withMetadata({ exif: {} })` or equivalent — PDPA safeguard, receipts may carry GPS). PDFs are passed through unchanged with no thumbnail (admin sees a "PDF" placeholder card).
- **D-10 — File caps:** Server-side limits — max 10 MB, allowlist `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `application/pdf`. Reject anything else with `413 Payload Too Large` or `415 Unsupported Media Type`. Cap enforced in BOTH the public token-upload action AND the admin upload action.
- **D-11 — Admin review surface:** All Confirm / Reject happens inline on `/admin/orders/[id]`. New section "Payment Proof" appears when at least one `payment_proofs` row exists for the order. Renders a 256px thumbnail (or PDF placeholder card) plus metadata sidebar (upload time, file size, uploader role, expected amount = `orders.totalAmount`). Two primary buttons: **Confirm Payment** (transition `awaiting_payment_review → paid`) and **Reject** (opens a textarea modal for `admin_note`, then transitions `awaiting_payment_review → awaiting_customer`).
- **D-12 — Slip lightbox:** Clicking the thumbnail opens a full-screen modal. Two-pane layout: image on left (75%), metadata sidebar on right (25%). Metadata pane shows upload time, file size, uploader (customer/admin), MIME type, and **expected amount = `orders.totalAmount` formatted MYR**. Sidebar collapses on screens < 768px (image takes full viewport; metadata renders as a stickied bottom sheet). Lightbox closes on `Esc` and on backdrop click.
- **D-13 — Multiple proofs per order:** `payment_proofs` is one-to-many on `order_id`. Each rejected slip stays in the table with `status='rejected'`. The Payment Proof section on `/admin/orders/[id]` shows the **latest** proof prominently with a "history" collapsed list of older ones. Customer re-upload writes a new row with `status='pending'`. Confirm/Reject buttons act on the latest pending row only.

### Customer draft page (payment method UX)
- **D-14 — Method-picker layout:** Two large cards (PayPal | Bank Transfer) side-by-side on desktop, stacked on mobile (≤768px). Each card has a brand icon, label, and a one-line description. Clicking a card **expands it inline** (smooth height transition) to reveal the method-specific UI; the other card collapses. Both cards remain visible — clicking the collapsed card swaps the expansion. PayPal card expands to the existing PayPal Smart Button. Bank Transfer card expands to bank details (read from `store_settings`) + slip upload form + Process button.
- **D-15 — Post-upload state on draft page:** Same URL. After successful slip upload, the page swaps client-side to a "Your proof of payment is being reviewed" state, showing: order number, expected amount, bank details (so customer can verify), uploaded slip thumbnail, ETA copy ("Admin will confirm within 24h"), and a WhatsApp support deeplink. The token remains valid; reopening the URL after admin rejection shows the rejection state with `admin_note` + the upload form again.
- **D-16 — Bank-details empty-state:** If any of `store_settings.bank_name`, `bank_account_number`, `bank_account_holder` is NULL or empty, the Bank Transfer card is **hidden entirely** from the draft page (server-side guard in the page render). Only PayPal renders. The customer is never shown a disabled-state Bank Transfer card.

### Admin send-draft prompt + deeplinks
- **D-17 — Post-submit confirmation:** After admin clicks Submit on `/admin/pos`, the order is created in `pending` status. A modal then asks: "Send order to customer for review?" with two buttons: **Yes — generate draft link** (default-focused) and **No — keep as pending**. Yes path runs `generatePaymentLink(orderId)`, transitions the order `pending → awaiting_customer`, copies the URL to clipboard, and shows the link + WhatsApp + email helpers. No path leaves the order at `pending` and routes admin to `/admin/orders/[id]`.
- **D-18 — Deeplinks format:**
  - WhatsApp: `https://wa.me/<phoneE164>?text=<encoded>` where phoneE164 strips formatting from `orders.shippingPhone`. Text template comes from a new `store_settings.draft_link_template` LONGTEXT (Mustache-style: `Hi {{customer_name}}, here's your order from 3D Ninjaz: {{link}}. Reply here if you have questions.`). Render via `renderTemplate` already present from Phase 5 (email-templates pattern).
  - Email: standard `mailto:` link with `subject` + `body` prefilled from the same template (no nodemailer trigger here — admin sends from their own mail client). Subject template lives alongside body in `store_settings`.

### State machine + migration approach
- **D-19 — Enum extension:** `orderStatusValues` widens from 6 to 8 strings: `['pending', 'awaiting_customer', 'awaiting_payment_review', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']`. Migration applies via raw-SQL applicator `scripts/phase20-migrate.cjs` (drizzle-kit push hangs on remote — Phase 6/7/18/19 precedent). SQL pattern: `ALTER TABLE orders MODIFY COLUMN status ENUM(...) NOT NULL DEFAULT 'pending'` listing all 8 values in order. Drizzle schema mirror updated in same commit.
- **D-20 — Transition graph extension:** `ORDER_STATUS_FLOW` in `src/lib/orders.ts` gains:
  - `pending: [...existing, 'awaiting_customer']`
  - `awaiting_customer: ['awaiting_payment_review', 'paid', 'cancelled']`
  - `awaiting_payment_review: ['paid', 'awaiting_customer', 'cancelled']`
  - All existing edges preserved verbatim. `assertValidTransition` is unchanged — it just reads the new graph.
- **D-21 — Payment method column:** New column `orders.payment_method ENUM('paypal','bank_transfer') NULL` (nullable). Default NULL. Back-fill via migration: `UPDATE orders SET payment_method='paypal' WHERE paypal_capture_id IS NOT NULL`. Future PayPal captures and Bank Transfer slip uploads set this column at status-transition time.
- **D-22 — payment_proofs table shape:**
  ```sql
  CREATE TABLE payment_proofs (
    id                   CHAR(36) NOT NULL PRIMARY KEY,
    order_id             CHAR(36) NOT NULL,
    image_url            VARCHAR(500) NOT NULL,
    thumbnail_url        VARCHAR(500) NULL,
    mime_type            VARCHAR(64) NOT NULL,
    size_bytes           INT NOT NULL,
    uploaded_by          ENUM('customer','admin') NOT NULL,
    uploaded_by_user_id  CHAR(36) NULL,
    status               ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    admin_note           TEXT NULL,
    reviewed_by          CHAR(36) NULL,
    reviewed_at          DATETIME NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pp_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    KEY idx_pp_order_status (order_id, status),
    KEY idx_pp_status_created (status, created_at)
  );
  ```
  Drizzle schema mirrors byte-for-byte. UUIDs via `crypto.randomUUID()`. JSON columns absent — no `ensureXxx` helper needed for this table.
- **D-23 — Token lifecycle for bank-transfer flow:** `paymentLinks.usedAt` is set ONLY when the order reaches `paid` (whether via PayPal capture or admin Confirm Payment). Slip upload alone does NOT mark the token used — the customer must remain able to re-open the same URL after a rejected slip. The `getPaymentLinkByToken` server action's `used` check therefore needs to additionally accept `awaiting_customer` and `awaiting_payment_review` order statuses as "live" tokens.

### Autosave + admin authn
- **D-24 — Admin autosave:** `/admin/pos` uses the existing admin-autosave pattern (1s debounced localStorage at `admin-pos-draft` namespace, banner-only "Restore draft" CTA per memory `feedback_admin_autosave_universal`). Saved keys: line array, customer fields, coupon code, shipping override, send-draft prompt response. Cleared on successful submit.
- **D-25 — Auth gates:** Every new admin server action (in `src/actions/admin-pos.ts`, `src/actions/admin-payment-proofs.ts`, `src/actions/admin-store-settings-bank.ts`) begins `const session = await requireAdmin();` as the **first await**. The public token-upload action in `src/actions/payment-links.ts` does NOT call `requireAdmin()` — it validates `(token exists, not expired, paymentLinks.usedAt IS NULL, order.status === 'awaiting_customer')` before any DB write or file write. Validation failures return `404 Not found` (uniform with existing T-07-X-PII-on-payment-link enumeration block).
- **D-26 — trustedOrigins:** No new origins needed; `/admin/pos` is same-origin with the rest of the admin panel. Existing `trustedOrigins` in `src/lib/auth.ts` covers it.

### Claude's Discretion
- The exact filename for the slip upload module (`payment-proof-storage.ts` vs `slip-upload.ts`) is a naming preference; planner/researcher may pick the clearer one.
- Internal layout of the metadata sidebar in the lightbox (vertical stack vs grid).
- Class names for the POS row-expansion animation.
- Choice between Sharp `.rotate().withMetadata({ exif: {} })` vs `.toBuffer({ resolveWithObject: true })` + metadata strip for EXIF.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase locks
- `.planning/phases/20-admin-pos-draft-order-flow/20-SPEC.md` — Locked requirements, boundaries, acceptance criteria. MUST read before planning.
- `.planning/ROADMAP.md` §"Phase 20" — phase entry and dependency

### State machine + order domain
- `src/lib/orders.ts` — `OrderStatus`, `ORDER_STATUS_FLOW`, `assertValidTransition`, `formatOrderNumber`. Extension target for D-19/D-20.
- `src/lib/db/schema.ts` lines 472–555 — `orderStatusValues`, `orderSourceTypeValues`, `orders` table shape, `order_items` (snapshot, no FK)

### Existing manual-order + payment-link infrastructure
- `src/actions/admin-manual-orders.ts` — Phase 7 manual order + `paymentLinks` actions. Extension target for `createManualOrder` (will be replaced by `/admin/pos` create action) and reuse of `generatePaymentLink` / `getActivePaymentLink` / `revokePaymentLink`.
- `src/app/(admin)/admin/orders/new/page.tsx` — Phase 7 free-text manual order route. Will remain as the "quick free-text" shortcut alongside the new `/admin/pos`.
- `src/app/payment-links/[token]/page.tsx` — Public draft page. Extension target for D-14 method picker + D-15 post-upload state + D-16 empty-state guard.
- `src/components/payment-link/payment-link-island.tsx` — Existing PayPal Smart Button island. Will become one child of the new method-picker.
- `src/actions/payment-links.ts` — `getPaymentLinkByToken` view-model. Extension target for D-23 lifecycle and the new public `uploadPaymentProofByToken` action.

### Customer order surfaces (rendering manual lines)
- `src/app/(store)/orders/[id]/page.tsx` — Customer order detail; manual-line render guards (D-08).
- `src/app/(store)/orders/[id]/invoice.pdf/route.tsx` — Invoice PDF route (owner-or-admin gated). D-08 render guards apply.
- `src/lib/pdf/invoice.tsx` — Invoice document component. Renders `item.productName / variantLabel / configurationData`. D-08 render guards apply.

### Admin surfaces
- `src/app/(admin)/admin/orders/page.tsx` + `src/app/(admin)/admin/orders/[id]/page.tsx` — Admin order list + detail. D-11 review section + D-26 Download Invoice button mount points.
- `src/components/admin/admin-order-filter.tsx` — Existing status filter. Extension target for "Awaiting payment review" chip.
- `src/components/admin/sidebar-nav-badge.tsx` (or equivalent badge-driver) — Pending-review count badge. Mirror Phase 7 07-06 pattern.

### Image pipeline + sharp
- `src/lib/image-pipeline.ts` — Existing `writeUpload` / `pickImage` multi-resolution pipeline. NOT reused for slips (D-09).
- `src/lib/storage.ts` (or `src/lib/product-images.ts`) — Low-level file write + slug sanitization helpers; the new `writePaymentProof` reuses path-sanitization utilities.

### Settings + store
- `src/lib/store-settings.ts` — DB-cached store settings reader. Extension target for `bank_name / bank_account_number / bank_account_holder / draft_link_template`.
- `src/app/(admin)/admin/settings/page.tsx` — Settings form. Extension target for bank fields.

### Templating + WhatsApp deeplinks
- `src/lib/email-renderer.ts` (per memory `Email System` + Phase 5 05-06) — Mustache-style `renderTemplate` already used for email templates; reused for D-18 deeplink template rendering.

### Coupons
- `src/actions/coupons.ts` + `src/lib/coupons.ts` — Existing coupon validator + atomic redemption. D-04 reuses verbatim.

### Migration scaffolding
- `scripts/phase6-migrate.cjs`, `scripts/phase7-migrate.cjs`, `scripts/phase18-migrate.cjs`, `scripts/migrate-add-product-type.ts` — Reference shapes for `scripts/phase20-migrate.cjs`.

### Memory + project quirks
- `CLAUDE.md` "Pivots & Production Quirks (2026-04-19 → 2026-04-21)" + "Session 2026-04-21 new quirks" — MariaDB 10.11 no-LATERAL, JSON-as-LONGTEXT, app-generated UUIDs, Better Auth admin role + CVE-2025-29927 first-await.
- Memory `feedback_admin_autosave_universal` — D-24 autosave rule.
- Memory `feedback_no_customer_autosave` — customer-side has no draft autosave (re-stated in SPEC boundaries).
- Memory `feedback_simple_solutions_first` — small Sonnet briefs, no scope drift.
- Memory `project_image_pipeline_unified` — `persistProductImage` / `resolveProductImage` is the only public image API; slip pipeline lives alongside under a sibling module.

### Phase 19 alignment
- `.planning/phases/19-made-to-order-product-type/19-CONTEXT.md` D-11/D-12 — Cart line + order_items `configurationData` LONGTEXT pattern. D-02 in this phase reuses the same configurator rendering on the admin POS row, so configurationData captured at POS submission is identical to a customer-checkout configurable line.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`generatePaymentLink` / `getActivePaymentLink` / `revokePaymentLink`** (`src/actions/admin-manual-orders.ts`) — Tokenized link generation reused unchanged; new POS action calls `generatePaymentLink` after writing the orders row.
- **`PaymentLinkIsland`** (`src/components/payment-link/payment-link-island.tsx`) — Becomes the PayPal child of the new method-picker; no rewrite needed.
- **`writeUpload` / `pickImage`** (`src/lib/image-pipeline.ts`) — NOT reused for slips (D-09); kept for product images only. Slip pipeline (`writePaymentProof`) sits alongside in a new sibling module.
- **`getStoreSettings()` + cache** (`src/lib/store-settings.ts`) — Extended with three bank columns + one template column. Cache invalidation pattern (60s + lazy-seed) preserved.
- **`getShippingRate(state, subtotal)`** (Phase 5 05-04) — Pre-fills the POS shipping field; admin can override (D-05).
- **Coupon validator + redemption** (`src/actions/coupons.ts`) — D-04 applies coupons at POS submit; same atomic UPDATE prevents over-redemption.
- **`assertValidTransition`** (`src/lib/orders.ts`) — Unchanged; reads the extended flow graph (D-20).
- **`formatOrderNumber` + invoice components** — Render manual lines via existing `productName` / `unitPrice` / `configurationData` fields (D-08).
- **`ColourPickerDialog` + `ConfiguratorForm` (Phase 18+19)** — Inline mounting on POS rows for `colour` + `configurable` lines.

### Established Patterns
- **Raw-SQL migration applicator** — `scripts/phase20-migrate.cjs` follows Phase 6/7/18/19 shape: open mysql2 pool, run schema ALTERs + CREATEs + back-fill UPDATEs inside transactions where supported, log idempotent skip-if-exists results, exit non-zero on any error.
- **Pattern B refetch** (Phase 17 AD-06) — POS line-edit ops (add, remove, configurator change) use a `getPosDraft()`-equivalent refetch after each shape-changing mutation. Pattern A optimistic update for simple field edits (quantity, unit-price override).
- **`requireAdmin()` first-await** — Every admin server action begins with `const session = await requireAdmin();` before any DB read/write or file IO. Sentinel pattern enforced by lint or hand-grep at review time.
- **Token-only public route** — `/payment-links/[token]` is the existing pattern; no PII in URL. The new public token-upload action follows the same `getPaymentLinkByToken` validation flow.
- **Admin sidebar badge** — Switch on `item.badge` key (Phase 7 07-06) for pending counts. Add a new badge key for `paymentProofsAwaitingReview`.
- **Admin row-expansion** — Variant editor's row-expansion pattern (`src/components/admin/variant-editor.tsx`) is the visual+code template for the POS line-row configurator inline expansion.
- **JSON LONGTEXT helpers** — `ensureImagesArray` / `ensureConfigJson` / `ensureJsonArray` set the precedent; no new JSON columns in this phase outside the existing `customImages` (kept legacy-mirror-only).

### Integration Points
- **`src/lib/db/schema.ts`** — Extend `orderStatusValues`, add `payment_method` enum + column, add `payment_proofs` table + relations, add 3 + 1 `store_settings` columns.
- **`src/lib/orders.ts`** — Extend `OrderStatus` type, extend `ORDER_STATUS_FLOW` with new edges, add `isManualLine` helper.
- **`/admin/pos`** — New route group + page + server action `createPosOrder` in `src/actions/admin-pos.ts`.
- **`/admin/orders/[id]`** — Add Payment Proof inline section + Download Invoice button + slip lightbox sibling.
- **`/admin/orders` filter** — Add "Awaiting payment review" filter chip.
- **`/admin/settings`** — Add Bank Details fieldset + Draft Link Template fieldset.
- **`/payment-links/[token]`** — Replace PayPal-only render with two-card method picker; new public action `uploadPaymentProofByToken`.
- **`src/lib/payment-proof-storage.ts`** — New module; sibling to `image-pipeline.ts`.
- **`src/actions/admin-payment-proofs.ts`** — New action module (Confirm, Reject, admin slip upload).

</code_context>

<specifics>
## Specific Ideas

- Bank Transfer instructions on the draft page should be **copy-to-clipboard** affordances on each of: bank name, account number, account holder, expected amount. Mobile-first usage means customers will paste these into the bank app — friction-reduction matters.
- Lightbox metadata sidebar: show **expected amount in big bold text** so admin's eye lands on it first when comparing against the slip.
- POS submit flow: the "Send to customer?" modal should auto-focus the **Yes** button (primary action; the typical path).
- "Reject" modal must require a non-empty `admin_note` (UX hint: "Tell the customer what went wrong, e.g. 'Slip shows RM 90 but the order is RM 120 — please re-upload the correct receipt.'").
- WhatsApp deeplink should be the **primary** send-helper (Malaysia-first market); email/mailto is secondary.

</specifics>

<deferred>
## Deferred Ideas

- **Admin-side notification fan-out on slip upload** (email/WhatsApp to admin when a customer uploads a proof) — out of SPEC scope; queue badge + manual refresh only for v1. Future phase if review volume grows.
- **Auto-OCR / auto-verification of slip content** — out of SPEC scope; manual admin review only.
- **Cash on Delivery (COD) as a third payment method** — separate phase if Malaysian customers demand it.
- **Storefront cart → bank-transfer payment** — bank transfer is admin-POS-only for v1.
- **POS hardware integration** (barcode scanner, receipt printer, cash drawer) — out of v1.
- **Staff role separation** (cashier vs admin) — out of v1; only `role='admin'` users access POS.
- **Customer-initiated decline / change-request UI** on draft page — out of SPEC; admin re-edits via `/admin/pos` if requested over WhatsApp.
- **Customer-side draft autosave** — out of SPEC per `feedback_no_customer_autosave`.
- **PayPal Reporting reconciliation extension for bank-transfer orders** — recon stays PayPal-only.
- **Refund flow for bank-transfer orders** — manual out-of-band for v1.
- **Audit log table for admin price overrides + coupon applications** — out of v1; the order_items + orders rows themselves are the audit trail.
- **Mobile-PWA optimization for POS on a phone** — POS form is mobile-friendly via D-04 tap-target rules, but no offline / install-prompt work in this phase.

### Reviewed Todos (not folded)
- `2026-05-02-publish-time-guard-for-empty-colour-palettes.md` — Colour-palette publish guard. Unrelated to Phase 20 scope (Phase 18 follow-up). Stays in `.planning/todos/pending/`.

</deferred>

---

*Phase: 20-admin-pos-draft-order-flow*
*Context gathered: 2026-05-17*
