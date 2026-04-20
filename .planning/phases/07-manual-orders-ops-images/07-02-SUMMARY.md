---
phase: 07-manual-orders-ops-images
plan: 02
title: PayPal SDK extensions — capture details, refund, disputes, reporting
status: complete
duration_min: 6
completed_at: 2026-04-20
requirements: [ADM-18, ADM-19, ADM-20, ADM-21, ADM-22]
key_files_created:
  - src/lib/paypal-refund.ts
  - src/lib/paypal-disputes.ts
  - src/lib/paypal-reporting.ts
key_files_modified:
  - src/lib/paypal.ts
key_decisions:
  - "@paypal/paypal-server-sdk v2.3.x has NO DisputesController — use direct fetch + OAuth bearer."
  - "Reporting API also via direct fetch (not TransactionSearchController) for portability."
  - "OAuth token cached on globalThis (~9h TTL); refreshed on miss."
---

# Phase 07 Plan 02: PayPal SDK extensions Summary

PayPal helper layer ready for Wave-2 plans. Four new exports: `getCaptureDetails`,
`issueCaptureRefund`, `listDisputesPage`/`getDispute`/`acceptClaim`/`provideEvidence`/
`escalateToArbiter`, and `fetchTransactions`. Every file is server-only.

## What was built

**`src/lib/paypal.ts` (extended)**
- `getCaptureDetails(captureId)` returns `CaptureDetails` (gross/fee/net/
  sellerProtection/createTime/updateTime/settleDate). Maps SDK
  `sellerReceivableBreakdown` to a flat shape. Returns `null` on 404.
- `getAccessToken()` — OAuth bearer cache on `globalThis.__paypalToken`
  with 60s safety margin. Re-uses Phase 3 webhook OAuth pattern.
- `paypalApiBase()` — env-based URL helper.
- Existing `ordersController()` + `paymentsController()` left untouched.

**`src/lib/paypal-refund.ts`**
- `issueCaptureRefund({ captureId, amount?, currency?, reason, invoiceId? })`.
- Maps PayPal error codes → friendly messages: `CAPTURE_FULLY_REFUNDED`,
  `INSUFFICIENT_AMOUNT`, `TRANSACTION_REFUSED`, `INVALID_RESOURCE_ID`,
  `NOT_AUTHORIZED`.
- Pure passthrough — caller (07-05) is responsible for amount-cap validation
  before calling.
- Reason capped at 200 chars (sent as PayPal `noteToPayer`).

**`src/lib/paypal-disputes.ts`**
- `listDisputesPage({ pageSize?, nextPageToken? })` — pages through
  `/v1/customer/disputes`.
- `getDispute(disputeId)` — fetches full record incl. `disputed_transactions`
  (used by 07-06 to resolve seller_transaction_id → orders.paypalCaptureId).
- `acceptClaim(disputeId, { note, refundAmount? })` — POST to accept-claim.
- `provideEvidence(disputeId, { evidences })` — multipart/form-data with
  `input.json` blob + per-document file blobs.
- `escalateToArbiter(disputeId, { note })` — POST to escalate.
- All return `{ ok: true }` or `{ ok: false, status, body }` for action UIs.

**`src/lib/paypal-reporting.ts`**
- `fetchTransactions({ startDate, endDate, pageSize?, fields? })` —
  iterates all pages of `/v1/reporting/transactions` (max 100 pages
  sanity guard = 50,000 transactions).
- Returns `{ transactions: Transaction[], truncated: boolean }`.
- Caller (07-07 cron) is expected to catch NOT_AUTHORIZED in error
  body for graceful Q-07-08 handling.

## Verification

- `npx tsc --noEmit` exits 0.
- All 4 files start with `import "server-only";` (T-07-02-bundle-leak).
- 4 new exports importable from `@/lib/paypal*`.
- Smoke test deferred to Wave-2 plans (07-04, 07-05, 07-06, 07-07) which
  invoke each helper with sandbox creds.

## Deviations from Plan

**1. [Rule 4 - Architectural deferred] No `disputesController()` wrapper added**
- **Found during:** Task 1 SDK introspection
- **Issue:** Plan called for `disputesController()` but
  `@paypal/paypal-server-sdk@2.3.0` does not export `DisputesController` class.
- **Fix:** Documented in paypal.ts comment, all dispute helpers go through
  `paypal-disputes.ts` (direct fetch). The plan's `paypal-disputes.ts` file
  is the actual implementation surface.
- **Commit:** 47e078f

**2. [Rule 2 - Critical] paypal.ts already had the SDK env-var fallback pattern in `resolveCredentials()`**
- **Found during:** Task 1 paypal.ts review
- **Issue:** `getAccessToken()` re-implemented env-var fallback that already
  exists in `resolveCredentials()`.
- **Fix:** Kept duplicated env reads in `getAccessToken()` to avoid coupling
  the OAuth flow to the SDK Client constructor (the SDK manages its own
  cache; we manage ours separately for fetch-based endpoints).
- **Commit:** 47e078f

## Self-Check: PASSED

- src/lib/paypal.ts: FOUND (with new exports)
- src/lib/paypal-refund.ts: FOUND
- src/lib/paypal-disputes.ts: FOUND
- src/lib/paypal-reporting.ts: FOUND
- All 4 files start with `import "server-only";`: VERIFIED
- Commit 47e078f: FOUND
