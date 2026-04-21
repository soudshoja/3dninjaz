# Phase 07 — Context

**Created:** 2026-04-16
**Phase goal:** Admin operates the store like a real retail counter — books one-off custom orders with PayPal-link generation, sees PayPal transaction-level financials AND manages refunds/disputes WITHOUT leaving the app, every uploaded image is auto-compressed for web speed, and broken pages render branded "ninja got lost" screens.

**Depends on:** Phase 5 (admin shell + analytics + sidebar slot machinery), Phase 3 (PayPal SDK singleton + orders schema + capture/webhook flow).

---

## Source Snapshots (assumptions baked in)

These are the live commits / file shapes Phase 7 plans against. Any drift below is a hand-off bug for the executor to surface before mutating.

| Source | Snapshot path | Notes |
|---|---|---|
| Brand palette | `.planning/phases/02-storefront-cart/DECISIONS.md` D-01 | blue `#2563EB`, green `#84CC16`, purple `#8B5CF6`, ink `#0B1020`, cream `#F7FAF4` — same admin + storefront. |
| Cart vocab | DECISIONS.md D-02 | "bag" user-facing; internals stay `cart-*`. Custom order admin form uses no bag vocab — pure admin surface. |
| Mobile-first | DECISIONS.md D-04 | All admin pages must validate at 390x844 + 375x667; tap targets ≥48px (60px primary). |
| PayPal SDK | `src/lib/paypal.ts` | Singleton client, `getPayPalEnvironment()`, `getPayPalClient()`, `ordersController()`, `paymentsController()`. **Phase 7 extends with `disputesController()`, `refundCapture()`, `transactionsController()` (or fetch fallback).** |
| PayPal flow | `src/actions/paypal.ts` | `createPayPalOrder` + `capturePayPalOrder` — never trust client price. Phase 7 generalizes price source: bag-derived OR custom-order manual amount. |
| Webhook | `src/app/api/paypal/webhook/route.ts` | Signature-verified, idempotent on `paypalCaptureId`. Phase 7 adds `PAYMENT.CAPTURE.REFUNDED` + `CUSTOMER.DISPUTE.CREATED` handlers. |
| Orders schema | `src/lib/db/schema.ts` | `orders` already has `paypalOrderId` UNIQUE + `paypalCaptureId`. Phase 7 ADDS `refundedAmount`, `paypalFee`, `paypalNet`, `sourceType` enum (web/manual), `customItemName`, `customItemDescription`, `customImages` JSON. |
| Admin shell | `src/app/(admin)/layout.tsx` + `src/components/admin/sidebar-nav.tsx` | Phase 5 grew sidebar to 14 items with `pendingReviewCount` badge prop-drill. Phase 7 ADDS Disputes + payment-link badge slot (mirror existing pattern). |
| Admin orders/payments | `src/app/(admin)/admin/orders/page.tsx`, `[id]/page.tsx`, `payments/page.tsx` | Phase 5 ships basic versions; Phase 7 ENRICHES them in-place (no rewrite — additive UI sections + new server-action calls). |
| Image upload | `src/components/admin/image-uploader.tsx` + `src/actions/uploads.ts` + `src/lib/storage.ts` | Currently writes raw bytes to `public/uploads/products/<bucket>/<uuid>.<ext>`. Phase 7 wraps with `sharp` pipeline to generate variants. |
| Email template | `src/lib/email/order-confirmation.ts` + `src/lib/email/templates.ts` | Phase 7 OPTIONALLY adds `paypal_fee` + `paypal_net` template variables; **decision deferred to executor — only render if D-07-Q-04 resolves "yes".** |
| MariaDB quirks | `CLAUDE.md` Pivots & Production Quirks | No LATERAL → manual hydration. JSON columns = LONGTEXT → `ensureJsonArray` helper. App-UUIDs via `randomUUID()`. **Drizzle-kit push hangs on remote → use raw-SQL applicator script (Phase 6 06-01 precedent: `scripts/phase6-migrate.cjs`).** |
| Auth gate | `src/lib/auth-helpers.ts` | `requireAdmin()` MUST be first await (CVE-2025-29927). Phase 7 server actions inherit. |
| Cron host | cPanel + LiteSpeed; `/home/ninjaz/apps/3dninjaz_v1` | Cron runs `node /home/ninjaz/nodevenv/apps/3dninjaz_v1/20/bin/node scripts/cron/reconcile-paypal.cjs`. **Plain Node CommonJS — does NOT bootstrap Next.js.** Reads env from `.env.local` via dotenv. |

---

## Locked Decisions for Phase 7

These flow from the user's roadmap criteria + project-locked stack. Treat as D-07-XX.

### D-07-01 — Sharp for image compression
- npm `sharp` (latest stable). Add as dep.
- Server-action only (never bundled to client). `import "server-only"` at top of pipeline module.
- Skip animated GIFs longer than 5s (mime-sniff rejection).

### D-07-02 — Variant matrix
- 3 widths: 400, 800, 1600 px (downscale only — never upscale).
- 3 formats per width: WebP, AVIF, JPEG (fallback).
- Quality target: ~78 (WebP/AVIF) / ~82 (JPEG).
- Total 9 variants + 1 original (`.bak/orig.<ext>`) per upload.

### D-07-03 — Storage layout
```
public/uploads/<scope>/<uuid>/
  orig.<ext>           # immutable backup
  400w.webp
  400w.avif
  400w.jpg
  800w.webp
  800w.avif
  800w.jpg
  1600w.webp
  1600w.avif
  1600w.jpg
  manifest.json        # { width, sources: { webp, avif, jpg } }[]
```
Scopes: `products`, `custom-orders`, `dispute-evidence`. Path-traversal guarded by existing `safeBucket()` in `storage.ts`.

### D-07-04 — `pickImage()` interface
- Server-side helper `pickImage(baseUrl)` reads `manifest.json`, returns `{ src: string, srcSet: string, type: "image/webp"|"image/avif"|"image/jpeg" }[]`.
- Storefront `<ProductCard>` and PDP gallery emit `<picture><source ../><img></picture>` with proper srcset.

### D-07-05 — Custom order schema (additive — no breaking changes)
- New columns on `orders`:
  - `sourceType` ENUM('web','manual') NOT NULL DEFAULT 'web'
  - `customItemName` VARCHAR(200) NULL
  - `customItemDescription` TEXT NULL
  - `customImages` JSON NULL (array of base URLs from `public/uploads/custom-orders/<uuid>`)
  - `refundedAmount` DECIMAL(10,2) NOT NULL DEFAULT '0.00'
  - `paypalFee` DECIMAL(10,2) NULL
  - `paypalNet` DECIMAL(10,2) NULL
  - `sellerProtection` VARCHAR(32) NULL
  - `paypalSettleDate` TIMESTAMP NULL
- Manual orders skip `order_items` insert; `paymentLink` generated separately via `payment_links` table.

### D-07-06 — `payment_links` table (new)
```
id          VARCHAR(36) PK     UUID app-generated
orderId     VARCHAR(36) FK orders.id ON DELETE CASCADE
token       VARCHAR(64) UNIQUE  random url-safe (base64url crypto.randomBytes(24))
expiresAt   TIMESTAMP NOT NULL  +30 days from creation
usedAt      TIMESTAMP NULL      set on first successful capture
createdBy   VARCHAR(36) FK user.id  the admin who generated it
createdAt   TIMESTAMP NOT NULL DEFAULT NOW()
```
**Public URL:** `https://app.3dninjaz.com/payment-links/<token>` (or apex domain post-launch) — token only, NEVER customer email/name in URL (T-07-X-PII-on-payment-link).

### D-07-07 — `dispute_cache` table (new)
```
id              VARCHAR(36) PK     UUID app-generated
disputeId       VARCHAR(64) UNIQUE PayPal dispute_id (case_number normalised)
orderId         VARCHAR(36) FK orders.id NULL  resolved via paypal_capture_id mapping
status          VARCHAR(32) NOT NULL  OPEN / WAITING_FOR_BUYER_RESPONSE / RESOLVED / etc
reason          VARCHAR(64)         BUYER_COMPLAINT / etc
amount          DECIMAL(10,2)
currency        VARCHAR(3)
createDate      TIMESTAMP NOT NULL
updateDate      TIMESTAMP NOT NULL
lastSyncedAt    TIMESTAMP NOT NULL DEFAULT NOW()
rawJson         LONGTEXT NULL       last fetched payload for evidence/audit
```
**Sync model:** Cache is a *read-through* aggregate; live thread + evidence always fetched on detail-page hit. List page reads cache + refreshes any row older than 15 min.

### D-07-08 — `recon_runs` table (new)
```
id              VARCHAR(36) PK     UUID
runDate         DATE NOT NULL UNIQUE  the day reconciled (yyyy-mm-dd, MY timezone)
ranAt           TIMESTAMP NOT NULL
totalPaypalTxns INT NOT NULL
totalLocalTxns  INT NOT NULL
driftCount      INT NOT NULL DEFAULT 0
driftJson       LONGTEXT NULL    array of {paypalTxnId, localOrderId|null, kind: missing_local | missing_paypal | amount_mismatch | refund_only_external}
status          VARCHAR(16) NOT NULL  ok / drift / error
errorMessage    TEXT NULL
```
**Snapshot:** ALSO write `.planning/intel/recon-YYYY-MM-DD.json` (gitignored — add `.planning/intel/` to `.gitignore` in 07-07).

### D-07-09 — Maintenance mode
- Env flag: `MAINTENANCE_MODE=true` toggles middleware redirect.
- Excluded paths: `/admin/**` (admin can still log in), `/api/health`, `/api/paypal/webhook` (webhook must keep functioning during maintenance).
- Page: `/maintenance` — branded ninja, ETA copy, no nav/footer.

### D-07-10 — Refund policy
- Server-side cap: `refundAmount <= (totalAmount - refundedAmount)` — checked BEFORE PayPal call (T-07-X-money).
- Reason field required (max 200 chars; sent as PayPal `note_to_payer`).
- Rate limit: 5 refunds / minute / admin (in-process Map, same pattern as Phase 6 06-06).
- Status flips: refund == total → `cancelled`; partial → status unchanged, `refundedAmount` updated.
- Webhook `PAYMENT.CAPTURE.REFUNDED` is idempotent on `refundedAmount` (re-add only if PayPal-reported total > local total).

### D-07-11 — Dispute action policy
- Rate limit: 10 actions / minute / admin.
- Dispute-to-order verification: every action loads `dispute_cache` row + asserts `orderId IS NOT NULL` AND admin's session.user.role === 'admin' (T-07-X-dispute-spoof).
- Evidence file upload: max 10MB per file, max 3 files per `provide-evidence` call (PayPal hard limit).

### D-07-12 — 500 error page
- NEVER renders `error.message`, `error.stack`, or any error property to the user.
- Generates a request-id (`crypto.randomUUID().slice(0,8)`).
- Logs server-side: `console.error("[error-page]", { requestId, message, stack })` — only the request-id surfaces to the user.
- Copy: "Something went wrong. Reference: <id>" + link to homepage.

### D-07-13 — Payment-link page authentication
- `/payment-links/[token]` is PUBLIC (customer hasn't logged in).
- Shows: order summary (item name + description + image gallery + total amount). NEVER customer email/phone/address.
- PayPal Smart Button rendered with `clientId` env. On capture → mark `usedAt` on payment_links row + flip orders.status to `paid`.
- Token expiry honored server-side (404 if `expiresAt < now()`).

---

## Integration Points

### Existing files this phase READS (no modification)
- `src/lib/paypal.ts` (extends — adds `disputesController()`, `transactionsController()`, `refundCapture()`)
- `src/lib/db/schema.ts` (extends — adds 3 tables + 8 columns)
- `src/lib/auth-helpers.ts` (`requireAdmin`)
- `src/lib/format.ts` (`formatMYR`)
- `src/lib/orders.ts` (`formatOrderNumber`, `assertValidTransition`)
- `src/lib/storage.ts` (`writeUpload`, `safeBucket` — Phase 7 wraps `writeUpload`)
- `src/lib/mailer.ts` (sending payment-link to customer email is OPTIONAL — see Q-07-02)
- `src/components/admin/sidebar-nav.tsx` (extends items list — adds Disputes entry)
- `src/components/admin/image-uploader.tsx` (consumed unchanged — pipeline runs server-side after `writeUpload`)

### New files this phase CREATES
- `src/lib/paypal-disputes.ts` (controller + helpers)
- `src/lib/paypal-reporting.ts` (transactions API + fetch fallback)
- `src/lib/paypal-refund.ts` (refund + cap + idempotency helpers)
- `src/lib/image-pipeline.ts` (sharp wrapper)
- `src/lib/image-manifest.ts` (`pickImage()` reader)
- `src/actions/admin-manual-orders.ts` (createManualOrder, listPaymentLinks, generatePaymentLink, regeneratePaymentLink)
- `src/actions/admin-disputes.ts` (listDisputes, getDispute, acceptClaim, provideEvidence, escalateToArbiter)
- `src/actions/admin-refunds.ts` (issueRefund)
- `src/actions/admin-recon.ts` (latestReconRun, listReconRuns, getReconRun)
- `src/actions/payment-links.ts` (PUBLIC: getPaymentLinkByToken, capturePaymentLinkPayment)
- `src/app/(admin)/admin/orders/new/page.tsx` (manual order form)
- `src/app/(admin)/admin/disputes/page.tsx`
- `src/app/(admin)/admin/disputes/[id]/page.tsx`
- `src/app/(admin)/admin/payments/[orderId]/refund/page.tsx`
- `src/app/payment-links/[token]/page.tsx` (PUBLIC route group at root, NOT under (store))
- `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx`
- `src/app/(store)/maintenance/page.tsx`
- `src/middleware.ts` (extend if exists, else create — maintenance redirect)
- `src/components/admin/manual-order-form.tsx`
- `src/components/admin/payment-link-card.tsx`
- `src/components/admin/payment-financials-panel.tsx` (gross / fee / net / settle date)
- `src/components/admin/refund-form.tsx`
- `src/components/admin/dispute-evidence-uploader.tsx`
- `src/components/admin/recon-drift-widget.tsx` (admin dashboard)
- `src/components/storefront/responsive-product-image.tsx` (`<picture>` srcset)
- `src/components/error/branded-404.tsx`, `branded-500.tsx`, `branded-maintenance.tsx`
- `scripts/phase7-migrate.cjs` (raw SQL DDL — drizzle-kit push hangs on remote)
- `scripts/cron/reconcile-paypal.cjs` (CommonJS cron entry)

---

## Open Questions for the User

These are blocking decisions Phase 7 plans CANNOT resolve without input. The orchestrator must surface them to the user before execute-phase. Defaults are listed; the executor proceeds with defaults unless overridden.

| ID | Question | Default if no answer |
|---|---|---|
| Q-07-01 | **Refund approval workflow.** When admin clicks "Issue refund", does the system call PayPal immediately (no second confirmation), or show a "type the refund amount again to confirm" dialog? | **Two-step confirm dialog** (type-amount-twice). Safer for the money-handling flow. |
| Q-07-02 | **Payment-link delivery.** When admin generates a payment link for a custom order, does the system also auto-email the link to the customer (if email known) via `nodemailer`, or does admin always copy-paste the link manually into WhatsApp / SMS / email themselves? | **Manual copy** (no auto-email in v1). Admin sees a "Copy link" button + a pre-filled `mailto:` link with the link in the body. |
| Q-07-03 | **Reconciliation notification channel.** When the nightly recon detects drift, does the system (a) only show a badge on /admin sidebar, (b) also write a row visible on /admin dashboard widget, (c) ALSO email the admin via nodemailer? | **(a) + (b) only** — sidebar drift badge + dashboard widget. No email noise in v1; admin checks dashboard daily. |
| Q-07-04 | **PayPal fee on customer receipt.** Should the order-confirmation email + /orders/[id] customer page show the PayPal fee + net amount the seller receives? Or is that admin-only? | **Admin-only.** Customers do not see the seller's fee structure. Only `gross MYR` continues to show on customer-facing screens. |
| Q-07-05 | **Maintenance mode trigger.** Is `MAINTENANCE_MODE` env var the only toggle, or does admin also need an in-app `/admin/settings` switch (DB-backed) that overrides it? | **env-only for v1.** Editing `.env.local` and restarting the Node app is the lever. Adding a DB toggle adds a 30-min refactor not justified for v1 launch. |
| Q-07-06 | **Image pipeline backfill.** Existing product images uploaded before Phase 7 lack the variant manifest. Do we (a) backfill once via a script, (b) lazy-generate on first read, or (c) leave them legacy + only new uploads get variants? | **(a) backfill via `scripts/phase7-image-backfill.cjs`** — admin runs it once after deploy. Simpler than lazy-gen at the read site. Plan 07-08 ships the script. |
| Q-07-07 | **Disputes refresh cadence.** `/admin/disputes` list — refresh from PayPal on every page load (cost: PayPal API call per visit), or every 15 min via the recon cron, or only on manual "Refresh" button click? | **Every 15 min via cron + manual button.** List page renders cache; explicit refresh button forces re-fetch. Detail page always live-fetches. |
| Q-07-08 | **PayPal Reporting API enablement.** `/v1/reporting/transactions` requires the merchant account to have the "Reporting" feature enabled (some accounts need PayPal support to enable it manually). Is the production 3dninjaz PayPal business account already enabled? | **Assume yes; if cron fails with `NOT_AUTHORIZED`, surface the error in `recon_runs.errorMessage` and pause future runs until admin contacts PayPal support.** Tracked in 07-07 PLAN. |

---

## Threat Model Summary (per-plan T-07-XX entries below)

Common threats spanning multiple plans:

- **T-07-X-money** — refund / payment-link amount tampering: every server action verifies amount server-side against `orders.totalAmount - orders.refundedAmount`; reject if exceeded.
- **T-07-X-dispute-spoof** — disputes UI verifies `dispute_cache.orderId IS NOT NULL` and that the case_number resolves to a real local order before mutating.
- **T-07-X-image-DoS** — pre-compress size cap 10MB; post-compress sanity check rejects pathological inputs (e.g. 100k × 100k pixel bombs); mime sniff via first 12 bytes of buffer (NOT the multipart content-type header).
- **T-07-X-PII-on-payment-link** — `/payment-links/<token>` URL contains ONLY the token; no email/name/phone in URL or query.
- **T-07-X-error-page-leak** — 500 page never renders `error.message` / `error.stack`; logs server-side only; user sees `Reference: <8-char-id>`.
- **T-07-X-recon** — nightly recon JSON snapshot to `.planning/intel/` is gitignored (T-07-X-recon-leak: PayPal txn IDs are sensitive); admin notification on drift > 0.

---

## Roadmap Mapping

| Roadmap criterion | Plan |
|---|---|
| 1. /admin/orders/new manual order form | 07-03 |
| 2. Custom order shows in admin/orders + admin/payments | 07-03 (schema) + 07-04 (display) |
| 3. Generate payment link → public URL | 07-03 |
| 4. Customer pays via link → webhook records capture | 07-03 (public route) + existing webhook |
| 5. PayPal payment-page parity (gross/fee/net/status/seller-protection/settle date) | 07-04 |
| 6. Refund button (full + partial) | 07-05 |
| 7. Disputes list + view + accept + provide-evidence + escalate | 07-06 |
| 8. Nightly recon cron + drift dashboard widget | 07-07 |
| 9. Auto image compression (WebP+AVIF+JPEG @ 400/800/1600) | 07-08 |
| 10. Long-cache headers + Next/Image srcset | 07-08 |
| 11. Branded 404/500/maintenance pages | 07-09 |

---

## Wave / Plan Map

```
WAVE 1 (parallel — foundations, no shared files):
  07-01: Schema + deps + raw-SQL migration script
  07-02: PayPal SDK extensions (disputes, refund, reporting)

WAVE 2 (parallel — depends on 07-01 + 07-02):
  07-03: Manual orders + payment-link public page + paymentLink server actions
  07-04: /admin/payments enriched + per-payment financials panel
  07-05: Refund button + form + server action + webhook handler

WAVE 3 (parallel within wave — depends on Wave 2):
  07-06: Disputes list + detail + accept/escalate/evidence-upload
  07-07: Nightly recon cron + drift dashboard widget + cPanel cron registration

WAVE 4 (parallel with Wave 3, no shared files):
  07-08: Image compression pipeline + storefront srcset + backfill script
  07-09: Branded 404/500/maintenance pages + middleware
```

Total: 9 plans across 4 waves. Maximum parallelism: Wave 2 = 3 parallel plans, Wave 3+4 combined = 4 parallel plans.

---

## Assumptions

1. **PayPal account features** — Disputes capability is approved (per roadmap), Refunds API is auto-approved (default), Reporting API enablement Q-07-08.
2. **DB migration applicator** — `drizzle-kit push` against remote MariaDB hangs (Phase 6 06-01 precedent); use raw SQL applicator at `scripts/phase7-migrate.cjs`.
3. **Cron environment** — cPanel cron entry runs `cd /home/ninjaz/apps/3dninjaz_v1 && /home/ninjaz/nodevenv/apps/3dninjaz_v1/20/bin/node scripts/cron/reconcile-paypal.cjs >> logs/recon.log 2>&1`. Cron registration is a Wave 3 cPanel UAPI task (or SSH `crontab -e`).
4. **`.planning/intel/`** — must be added to `.gitignore` in 07-07 before first cron run.
5. **No regressions** — Phases 1-6 file shapes unchanged. Plan 07-04's enrichment of `/admin/payments` is additive (new table columns + new detail panel — does not delete existing rows/columns).
6. **PayPal account is Malaysian** — `PAYPAL_CURRENCY=MYR` continues to work; refunds in MYR confirmed via Phase 3 SUMMARY 03-02.
7. **Sandbox test creds** — `sb-shnvz50688339@personal.example.com` / `_s!Cw2Wp` (sandbox MYR 5000) — used for refund + dispute smoke tests in Wave 2 + Wave 3 verify steps.
