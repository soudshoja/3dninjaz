# Quotation System — Plan

**Date:** 2026-08-18
**Status:** PLAN ONLY — no code written
**Branch strategy:** feature branch off `origin/dev` → PR into dev (green "Install + typecheck") → user smoke on app.3dninjaz.com → promote to master later. Never a direct push (branch protection).

---

## 1. Goal

The quotation is the FIRST document sent to EVERY client (B2B corporate and normal customers alike). It carries the rules/terms. When the client pays, the admin marks the payment; that creates/updates an order and triggers the EXISTING invoice pipeline, sent exactly as invoices are sent today.

The existing invoice (`src/lib/pdf/invoice-branded.tsx` + `src/lib/pdf/render-invoice.tsx`) is **not redesigned, not replaced, not modified**. The quotation is a new sibling document that sits in front of it.

---

## 2. Decisions with rationale

### D-Q1 — New `quotations` + `quotation_items` tables (NOT a flag on `orders`)

**Decision:** two new standalone tables. **Zero DDL on `orders` and `order_items`. Zero change to the `orders.status` enum.**

Rationale (each point verified against the repo):

1. A quote is not a sale. `src/lib/accounting.ts` derives cash-basis revenue from `orders` rows where `CAST(amountPaid) > 0` (line 95) — but everything else in the app also assumes an `orders` row is a real commitment: `/admin/orders` listing, `bulkDeleteOrders`, the production board (`orders.productionAddedAt`, `order_items.productionDone`), Delyva booking, PayPal recon, order counts. A `status='quote'` value on the existing enum would force a guard into every one of those code paths. New tables mean **none** of them are touched.
2. The client block is not a storefront account. "Khai Wong / JO Malone London" has a company name, a contact person, and possibly no email/user row. `orders` requires `customerEmail`, `shippingLine1/City/State/Postcode` NOT NULL — a quote frequently has none of that yet. Forcing sentinel values into `orders` (the `manual+<id>@3dninjaz.local` trick in `admin-manual-orders.ts`) for every quote pollutes the order book with non-orders.
3. Quote numbers are an independent series (`#0023`) — it must not collide with `formatOrderNumber()` (`PN-<uuid tail>` in `src/lib/orders.ts:104`). A separate table gives it a clean sequential column.
4. The order stays the single source of truth for money actually received (`orders.amountPaid`), so accounting keeps working with **no changes at all** (see D-Q4).

### D-Q2 — Quote number: `AUTO_INCREMENT` secondary column, formatted `#NNNN`

`quotations.id` = app-generated `crypto.randomUUID()` (CLAUDE.md rule), and a separate `quote_no INT NOT NULL AUTO_INCREMENT, UNIQUE KEY uq_quotations_quote_no (quote_no)` column. MariaDB/InnoDB allows AUTO_INCREMENT on a non-PK column as long as it is the first column of some index — the UNIQUE key satisfies that. This gives a gapless-enough, race-safe sequential series without a counter table and without trusting `$returningId()` (we re-`SELECT quote_no FROM quotations WHERE id = ?` after INSERT — same pattern as the UUID round-trip rule).

Formatting helper `formatQuoteNumber(n: number): string` → `"#" + String(n).padStart(4, "0")` lives in a **plain** (non-`"use server"`) module `src/lib/quotations.ts` so both PDF and UI can import it (the `"use server"` type-export landmine).

Series start: the migration script runs `ALTER TABLE quotations AUTO_INCREMENT = <next>` where `<next>` is a constant at the top of the script — **open question Q1: what is the client's next number after #0023?** Default the constant to `24`.

### D-Q3 — Deposit tracked on the QUOTATION; the order expresses it through the existing `amountPaid` column

The client's terms: 50% down to start production, balance before shipment. Verified facts:

- `orders.amountPaid` already exists ("Amount the customer has actually paid… balance due = totalAmount − amountPaid", schema.ts:566).
- `invoice-branded.tsx` **already renders partial payment**: when `amountPaid > 0` and balance > 0.005 it shows "Order Total / Amount paid / Balance Due" (`hasBalance`, lines 522–527, 723–733), and for non-paid statuses it shows the bank block ("Please make payment via", line 674).
- `updateOrderStatus(orderId, "paid")` in `src/actions/admin-orders.ts` sets `amountPaid = totalAmount` and fires the full existing pipeline: confirmation email + `order_approved` WhatsApp + `sendWhatsAppInvoicePdf` (lines 372–419).

**Therefore no new order status and no new order columns are needed:**

| Quote event | Effect on linked order |
|---|---|
| Deposit (50%) marked paid | Order **created** with `status='pending'`, `amountPaid = depositAmount`, `totalAmount = quote total`. Existing invoice renders: no PAID stamp, Amount Paid, **Balance Due**, bank block. Deposit is recognised as cash-basis revenue immediately (`amountPaid > 0`) — correct, money was received. |
| Balance marked paid (or 100% single payment) | Existing `updateOrderStatus(orderId, "paid")` — the D3-12 state machine allows `pending → paid` (orders.ts:41). It sets `amountPaid = totalAmount` and triggers the untouched invoice/email/WhatsApp pipeline. |

The production board is unaffected: production entry is already a **manual** flag (`productionAddedAt`, "any status" per the 2026-06-14 note in schema.ts) — admin adds the deposit-paid order to production exactly as today.

Quotation-side status vocabulary (`quotations.status` enum): `draft → sent → deposit_paid → completed`, plus `cancelled`. "Expired" is **not** a stored status — it is computed at render time (`status='sent' AND validUntil < today`), so no cron and no state to get stuck.

### D-Q4 — Quote → invoice conversion: quote CREATES a linked order, idempotently

- New column `quotations.order_id CHAR(36) NULL UNIQUE` — the traceability link. Nothing added to `orders`.
- **Idempotency (double-click proof):** the convert action generates `orderId = randomUUID()` and first executes an atomic claim: `UPDATE quotations SET order_id = ?, status = 'deposit_paid'|'completed' WHERE id = ? AND order_id IS NULL AND status = 'sent'`. If `affectedRows === 0`, another click already converted — re-read and return the existing `orderId`. Only the winning claim proceeds to `INSERT` the order + items. The UNIQUE key on `order_id` is the DB-level backstop.
- Order fields on conversion: `sourceType: 'manual'` (reuses the existing enum — **no enum extension**; the quote link itself marks provenance), `customerEmail` = quote contact email or the `manual+<orderId>@3dninjaz.local` sentinel (existing convention, admin-manual-orders.ts:72 — the sentinel also suppresses the confirmation email in `updateOrderStatus`, line 407), shipping block = quote's delivery fields or admin-confirmed values entered on the convert dialog.
- Items: each `quotation_items` row becomes an `order_items` row with `productId: 'manual', variantId: 'manual'` — the existing `isManualLine()` sentinel (orders.ts:81–85) which `invoice-branded.tsx` already renders by bare `productName` (line 545). So the **existing invoice renders quote-originated line items with zero changes**.
- Quote number preserved: admin order detail page shows "From Quotation #0023" by querying `quotations WHERE order_id = ?` (one indexed SELECT — no join, MariaDB-safe). The reverse link (quote detail → order) uses `quotations.order_id`.

### D-Q5 — Sending reuses the existing senders

- **WhatsApp:** new `sendWhatsAppQuotationPdf(quotationId, phone)` in `src/lib/whatsapp/sender.ts`, a near-copy of `sendWhatsAppInvoicePdf` (same master-toggle + connection gates, `sendMedia`, filename `quotation-0023.pdf`). New event key `quotation_sent` appended to `WHATSAPP_EVENT_KEYS` in `src/lib/whatsapp/events.ts` (+ label, variables `customerName, quoteNumber, quoteTotal, validUntil`, default template). `getWhatsappNotificationsAll()` lazy-seeds new keys as ENABLED — acceptable here because the event only ever fires from an explicit admin "Send" click (unlike `draft_abandoned_reminder`, which needed `DEFAULT_ENABLED: false`). No `DEFAULT_ENABLED` entry needed.
- **Email:** new template key `quotation_sent` added to `TemplateKey` + seeds in `src/lib/email/templates.ts` (DB-row templates — the standalone-build Markdown quirk is why they're DB rows). Send via `sendMail()` in `src/lib/mailer.ts`, **extended additively** with an optional `attachments?: { filename: string; content: Buffer }[]` param (nodemailer supports this natively) so the quotation PDF rides along. Existing callers unaffected.
- All links via `publicUrl()` (`src/lib/public-url.ts`) only.

### D-Q6 — PDF: `quotation-branded.tsx` sibling, design already settled (Jo Malone match)

Two-page @react-pdf document, Helvetica only, matching the client's existing quotation exactly (NOT the invoice's diagonal-stripe style — do not redesign in either direction):

- **Page 1:** logo top-left with wordmark + entity line beneath; large bold right-aligned `QUOTATION` title; solid black separator bar (full-width `View` with `backgroundColor: "#000"`); meta block (quote no `#0023`, date, validity, production lead time, client block: contact / company); free-text project description; plain rule-separated table `Package Inclusion | Qty | Unit Price | Total RM`; `Total` reversed out of a solid black box (white bold text on black `View`); thick black rule; italic footer (`Helvetica-Oblique`); italic contact block left; acceptance + signature block right (name/signature/date lines).
- **Page 2:** `TERMS & CONDITIONS` — bulleted payment-terms list (per-quote editable, seeded from defaults: 50% down payment to commence production, balance before shipment, validity, lead time, etc.) + bank block rendered from `store_settings.bankAccountHolder` ("CITY COMMERCE SDN. BHD.") / `bankAccountNumber` / `bankName` — the same three columns the invoice's bank block already uses via `getStoreSettingsCached()`.
- `render-quotation.tsx` mirrors `render-invoice.tsx`: server-only, never throws, trusted-context DB fetch (two plain SELECTs — quote row, then items; no `db.query...with` LATERAL), `renderToStream` → Buffer/base64.
- react-pdf v4 constraints already documented in invoice-branded.tsx apply: no Intl, no Canvas, built-in Helvetica/Helvetica-Bold/Helvetica-Oblique.
- Flag: the entity line under the wordmark. `BUSINESS.legalName` is `"3D Ninjaz"` (business-info.ts:24) but the Jo Malone quote shows the Sdn Bhd entity. Plan uses `store_settings.bankAccountHolder` as the entity line fallback → **open question Q2**.

### D-Q7 — Accounting ignores quotations by construction

`src/lib/accounting.ts` reads ONLY `orders` (amountPaid/refunded/fees), `expenses`, `assets`, `payouts`. The new `quotations` tables are never imported there. Revenue recognition path: quote sent = RM0 recognised → deposit marked = order row with `amountPaid = deposit` (recognised — cash received) → balance marked = `amountPaid = totalAmount` (remainder recognised). No accounting code changes; task 7 adds a comment in accounting.ts stating quotations are intentionally excluded, so a future edit doesn't "helpfully" add them.

---

## 3. Schema (exact DDL)

Applied by a new idempotent applicator `scripts/quotations-migrate.cjs` — INFORMATION_SCHEMA-guarded, schema name from `SELECT DATABASE()` (NOT `DB_NAME` env — the Aug 2026 silent-skip incident), `SHOW CREATE TABLE` verification at the end, modelled byte-for-byte on `scripts/drafts-customer-notified-at-migrate.cjs`. **Never `drizzle-kit push`.** Matching Drizzle definitions appended to `src/lib/db/schema.ts`.

```sql
CREATE TABLE IF NOT EXISTS `quotations` (
  `id`                    CHAR(36)      NOT NULL,
  `quote_no`              INT           NOT NULL AUTO_INCREMENT,
  `status`                ENUM('draft','sent','deposit_paid','completed','cancelled')
                                        NOT NULL DEFAULT 'draft',
  -- client block (B2B contacts are NOT user accounts; all free text)
  `contact_name`          VARCHAR(200)  NOT NULL,
  `company_name`          VARCHAR(200)  NULL,
  `contact_email`         VARCHAR(255)  NULL,
  `contact_phone`         VARCHAR(32)   NULL,
  `contact_address`       TEXT          NULL,
  -- optional soft link to a storefront account (nice-to-have, no cascade)
  `user_id`               VARCHAR(36)   NULL,
  -- document body
  `project_description`   TEXT          NULL,
  `production_lead_time`  VARCHAR(120)  NULL,          -- free text: "3–4 weeks from deposit"
  `valid_until`           VARCHAR(10)   NOT NULL,      -- YYYY-MM-DD (matches expenses.expense_date convention)
  `terms`                 LONGTEXT      NULL,          -- JSON string[] — parse via ensureTermsArray()
  -- money (MYR, mirrors orders precision)
  `subtotal`              DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_amount`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `currency`              VARCHAR(3)    NOT NULL DEFAULT 'MYR',
  `deposit_percent`       DECIMAL(5,2)  NOT NULL DEFAULT 50.00,  -- 100.00 = full payment upfront
  `deposit_amount`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,   -- snapshot at send time
  -- lifecycle timestamps
  `sent_at`               TIMESTAMP     NULL DEFAULT NULL,
  `deposit_paid_at`       TIMESTAMP     NULL DEFAULT NULL,
  `completed_at`          TIMESTAMP     NULL DEFAULT NULL,
  -- conversion link — UNIQUE is the idempotency backstop (D-Q4)
  `order_id`              CHAR(36)      NULL DEFAULT NULL,
  `notes`                 TEXT          NULL,          -- admin-only internal notes
  `created_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quotations_quote_no` (`quote_no`),
  UNIQUE KEY `uq_quotations_order_id` (`order_id`),
  KEY `idx_quotations_status_created` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Series start (guarded: only when the table is empty). Q1: confirm next number.
ALTER TABLE `quotations` AUTO_INCREMENT = 24;

CREATE TABLE IF NOT EXISTS `quotation_items` (
  `id`            CHAR(36)      NOT NULL,
  `quotation_id`  CHAR(36)      NOT NULL,
  `position`      INT           NOT NULL DEFAULT 0,
  `description`   VARCHAR(500)  NOT NULL,              -- "Package Inclusion" column
  `quantity`      INT           NOT NULL DEFAULT 1,
  `unit_price`    DECIMAL(10,2) NOT NULL,
  `line_total`    DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_qi_quotation` (`quotation_id`, `position`),
  CONSTRAINT `fk_qi_quotation` FOREIGN KEY (`quotation_id`)
    REFERENCES `quotations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Notes:
- No FK from `quotations.order_id` to `orders` at app level (matches the codebase pattern — payment_proofs comment: "FK enforced at live DB level"; and `bulkDeleteOrders` never relies on cascades). The convert action and delete paths handle the link explicitly; deleting an order leaves the quote row with a dangling `order_id` rendered as "order deleted" (audit trail preserved).
- `terms` is LONGTEXT-JSON → mandatory read helper `ensureTermsArray(raw): string[]` in `src/lib/quotations.ts` (same defensive shape as `ensurePhotoArray` in schema.ts:856).
- All UUIDs from `crypto.randomUUID()` at INSERT; `quote_no` read back by `SELECT` after insert.
- The dev DB (`ninjaz_3dn`) gets the migration first; prod (`ninjaz_3dnp`) only at promotion time, via the same script over the SSH tunnel/root socket.

---

## 4. Task breakdown (dependency order)

### Task 1 — Schema + migration + core lib
**Files:** `src/lib/db/schema.ts` (append `quotations`, `quotationItems`, relations, `quotationStatusValues`), `scripts/quotations-migrate.cjs` (new), `src/lib/quotations.ts` (new: `formatQuoteNumber`, `ensureTermsArray`, `DEFAULT_QUOTE_TERMS: string[]`, `computeDeposit`, `QuotationStatus` types — plain module, NOT `"use server"`).
Run the migration against dev DB; verify with `SHOW CREATE TABLE`.

### Task 2 — Quotation PDF (the settled Jo Malone design)
**Files:** `src/lib/pdf/quotation-branded.tsx` (new — `NinjazQuotationDocument`, two fixed pages per D-Q6), `src/lib/pdf/render-quotation.tsx` (new — `renderQuotationPdfBuffer/Base64`, mirrors render-invoice.tsx incl. `resolveBusiness()` reuse of `getStoreSettingsCached()` bank fields).
Depends on Task 1 (reads quote rows). Verify by rendering a fixture quote to a local PDF and eyeballing against the Jo Malone reference (per the "verify visually before claiming done" rule).

### Task 3 — Server actions
**Files:** `src/actions/admin-quotations.ts` (new, `"use server"`; **`requireAdmin()` is the first `await` in every export**; no type/const exports — types live in `src/lib/quotations.ts`). Exports:
- `createQuotation(input)` / `updateQuotation(id, input)` — Zod schema in `src/lib/validators.ts`; items replaced wholesale on save (delete+insert inside a transaction); recompute subtotal/total/depositAmount server-side.
- `listQuotations(filter)` / `getQuotation(id)` — two-query manual hydration (quote row, then `inArray`-less single `WHERE quotation_id = ?` items SELECT). No `db.query…with` (LATERAL).
- `sendQuotation(id, { via: "whatsapp" | "email" | "both" })` — guards status `draft|sent`; sets `status='sent'`, `sent_at`, snapshots `deposit_amount`; fires `sendWhatsAppQuotationPdf` + templated email with PDF attachment (best-effort `void …catch`, existing pattern).
- `markQuotationDepositPaid(id, shippingOverride?)` — the atomic-claim conversion from D-Q4: claims `order_id`, INSERTs order (`status='pending'`, `amountPaid=deposit`, `sourceType='manual'`) + manual-sentinel `order_items`, sets quote `status='deposit_paid'`; then best-effort `sendWhatsAppInvoicePdf(orderId, phone)` (the deposit invoice shows Balance Due + bank block automatically).
- `markQuotationPaidInFull(id)` — if not yet converted (100% upfront quote): same claim+create, then call the **existing** `updateOrderStatus(orderId, "paid")`; if already `deposit_paid`: just `updateOrderStatus(existingOrderId, "paid")`. Either way the untouched invoice pipeline fires. Sets quote `status='completed'`.
- `cancelQuotation(id)` / `deleteQuotation(id)` (delete only from `draft`).
- `revalidatePath('/admin/quotations')` + detail path after each mutation.
Depends on Tasks 1–2.

### Task 4 — Senders
**Files:** `src/lib/whatsapp/events.ts` (append `quotation_sent` key + label + variables + default template — lazy-seed lands it ENABLED, fine per D-Q5), `src/lib/whatsapp/sender.ts` (add `sendWhatsAppQuotationPdf`), `src/lib/email/templates.ts` (add `quotation_sent` TemplateKey + seed + variables), `src/lib/mailer.ts` (additive optional `attachments` on `sendMail`).
Depends on Task 2. Independent of Task 3 code-wise but Task 3 calls these — land 4 before or with 3.

### Task 5 — Admin UI
**Files:** `src/app/(admin)/admin/quotations/page.tsx` (list: number, client, total, status badge incl. computed "Expired", created), `.../quotations/new/page.tsx` + `.../quotations/[id]/page.tsx` (builder/detail: client block, description, lead time, validity date, deposit %, line-item editor, per-quote terms editor seeded from `DEFAULT_QUOTE_TERMS`, buttons: Save / Preview PDF / Send / Mark deposit paid / Mark paid in full / Cancel; after conversion shows linked order `PN-xxxx` link), `.../quotations/[id]/quotation.pdf/route.tsx` (admin-only PDF stream: `requireAdmin()` first await, `Cache-Control: private, no-store` — mirrors the invoice.pdf route), plus a "Quotations" entry in the existing admin nav component and a "From Quotation #NNNN" line on `src/app/(admin)/admin/orders/[id]/page.tsx` (single SELECT by `order_id`).
Client components follow existing admin conventions (shadcn/ui, server actions via forms/transitions). Depends on Task 3.

### Task 6 — Accounting guard + docs
**Files:** `src/lib/accounting.ts` (comment-only: quotations intentionally excluded; revenue enters via orders.amountPaid at deposit/balance), `CLAUDE.md` (short "Quotation system" note: tables, number series, conversion invariants).

### Task 7 — Typecheck, fixture smoke, PR to dev
`npx tsc --noEmit`; seed one fixture quote on dev DB; full flow smoke on app.3dninjaz.com: create → preview PDF (both pages vs reference) → send to test WhatsApp → mark deposit → check `/admin/orders` shows the pending order with Balance Due invoice → mark paid in full → confirm existing invoice email/WhatsApp arrived. Prod migration + promotion are a separate later step (dev-first rule).

---

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Double-click on "mark deposit paid" creates two orders | Atomic conditional UPDATE claim on `quotations.order_id IS NULL` + DB UNIQUE key on `order_id` (D-Q4). Loser re-reads and returns existing orderId. |
| Migration silently skips on prod (Aug 2026 incident) | Applicator derives schema from `SELECT DATABASE()`, never `DB_NAME`; prints `SHOW CREATE TABLE` for eyeball verification. |
| LATERAL join failure on MariaDB 10.11 | All reads are explicit two-query hydration; no `db.query.quotations.findMany({ with })` anywhere. |
| `terms` LONGTEXT not parsed | Single `ensureTermsArray()` helper; every read site (PDF, UI, actions) goes through it. |
| `"use server"` type-export 500 | All types/consts in `src/lib/quotations.ts`; `admin-quotations.ts` exports async functions only. |
| Deposit revenue double-counted or missed in accounting | Nothing accounting-side changes; money enters only via `orders.amountPaid` (deposit at conversion, remainder via existing `updateOrderStatus('paid')` which sets `amountPaid = totalAmount` — not `+= balance`, so no double count). |
| Invoice shows wrong payment state at deposit stage | Verified: `status='pending'` + `amountPaid>0` renders "Amount paid / Balance Due" + bank block, no PAID stamp (invoice-branded.tsx lines 522–527, 674, 723–733). No invoice change needed. |
| `updateOrderStatus` fires confirmation email to sentinel address | Already guarded: `endsWith("@3dninjaz.local")` skip (admin-orders.ts:407). Quote contacts without email get the sentinel. |
| WhatsApp silent no-send to B2B contact | Known quirk: bad MSISDN → `normalizeMsisdn` null → silent skip. Send action surfaces "WhatsApp not sent (no valid phone)" in the UI result instead of silently succeeding. |
| Quote edited after sending, PDF drifts from what client saw | `sent_at` + status guard: editing a `sent` quote returns it to `draft` semantics is NOT allowed silently — action requires explicit "revise" which keeps the same quote_no but updates `updated_at` (simple v1: allow edit while `sent`, block once `deposit_paid`). |

---

## 6. Out of scope (explicitly)

- Any change to `invoice-branded.tsx`, `render-invoice.tsx`, or the invoice routes/pipeline.
- Any change to `orders` / `order_items` DDL, the `orders.status` enum, or the D3-12 transition map.
- Customer-facing quote acceptance portal / e-signature / public quote link (v1 is PDF over WhatsApp/email; acceptance is verbal + payment).
- PayPal payment links for quote deposits (bank transfer is the B2B norm here; can bolt on `payment_links` later since a pending order exists after conversion).
- Partial-payment schedules beyond deposit+balance (no 3+ instalments).
- Auto-expiry cron, quote reminders, quote versioning/revision history.
- Stock/production coupling from quote lines (lines are free text; production entry stays manual).
- Prod DB migration + master promotion (separate step after dev smoke, per dev-first rule).

---

## 7. Open questions for the user

1. **Q1 — Number series:** current quote is `#0023`. Should the system start at `#0024`, or a fresh higher round number (e.g. `#0100`)? (Constant in `scripts/quotations-migrate.cjs`.)
2. **Q2 — Entity line under the logo:** the Jo Malone quote shows the corporate entity. Should the quotation header show "CITY COMMERCE SDN. BHD." (= `store_settings.bankAccountHolder`), "3D Ninjaz", or both ("3D Ninjaz — a brand of City Commerce Sdn. Bhd.")? *I am guessing the relationship between the two names from the bank block alone — not verified anywhere in the repo.*
3. **Q3 — Deposit invoice at deposit time:** on "mark deposit paid" the plan sends the existing invoice PDF (showing Amount Paid + Balance Due + bank details). Confirm you want an invoice at BOTH payment events (deposit and final), or only at final payment.
4. **Q4 — Default terms list:** please supply the exact bullet list from the Jo Malone quote's page 2 (payment terms wording) so `DEFAULT_QUOTE_TERMS` matches verbatim — I have the structure but not the exact sentences. *Guessing on wording until provided.*
5. **Q5 — Shipping on quotes:** quote lines are `Package Inclusion` rows only (Jo Malone format has no separate shipping line). Should delivery cost, when charged, be entered as a line item, or do you want a dedicated shipping row like the invoice's Subtotal/Shipping breakdown?
6. **Q6 — Who converts for normal (storefront-style) customers:** the flow assumes admin builds every quote by hand at `/admin/quotations/new`. Confirm there is no requirement to auto-generate a quote from an existing bag/draft order in v1.

---

## Flagged guesses (not read from the repo)

- The City Commerce / 3D Ninjaz entity relationship (Q2).
- Exact terms wording and the precise Jo Malone layout measurements — layout is described from the task brief, the reference PDF itself is not in the repo.
- Whether `sendOrderConfirmationEmail` attaches the invoice PDF to the email (I read its call sites, not its body); Task 4's email attachment work is for the QUOTATION email only, so nothing depends on this either way.
