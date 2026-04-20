---
phase: 07-manual-orders-ops-images
plan: 04
title: /admin/payments enriched + per-payment financials panel
status: complete
duration_min: 14
completed_at: 2026-04-20
requirements: [ADM-18]
key_files_created:
  - src/components/admin/payment-financials-panel.tsx
  - src/app/(admin)/admin/payments/[orderId]/page.tsx
key_files_modified:
  - src/actions/admin-payments.ts
  - src/app/(admin)/admin/payments/page.tsx
  - src/app/(admin)/admin/orders/[id]/page.tsx
key_decisions:
  - "Cache-hydrate write happens on read site (getPaymentDetail) — no separate cron needed."
  - "settle date proxied via PayPal updateTime when status=COMPLETED (SDK exposes no explicit settle_date)."
  - "Refund chip filter uses raw SQL CAST for precise decimal comparison."
---

# Phase 07 Plan 04: PayPal financials mirror Summary

`/admin/payments` now mirrors the PayPal Activity dashboard with gross/fee/
net/refunded columns and a refund-status chip filter. New per-payment
detail page at `/admin/payments/[orderId]` surfaces the live capture
detail (gross/fee/net/seller-protection/settle date). PaymentFinancialsPanel
is also embedded in `/admin/orders/[id]` for paid orders so admin sees
PayPal data without leaving the order page.

## What was built

**Server action enrichment (`src/actions/admin-payments.ts`)**
- `AdminPaymentRow` extended with `refundedAmount`, `paypalFee`, `paypalNet`.
- `ListAdminPaymentsInput.refunded` chip filter: `any | none | partial | full`.
  Uses raw SQL `CAST(... AS DECIMAL(10,2))` for precise comparison
  (mysql2 returns decimals as strings).
- `getPaymentDetail(orderId)` — admin-gated. Loads orders row, calls
  `getCaptureDetails(captureId)`, returns merged view with `live | null` and
  `liveError | null`. Cache-hydrates orders.paypalFee/paypalNet/
  sellerProtection/paypalSettleDate on first successful fetch.

**Components**
- `PaymentFinancialsPanel`: server component, 6-cell grid (gross/fee/net/
  status pill / seller protection / settle date), refunded summary band
  when refunded > 0. liveError banner when PayPal call fails. Mobile:
  2-col, lg+: 6-col.

**Pages**
- `/admin/payments/[orderId]` new: header with order # + ids, financials
  panel, "Issue refund" CTA (link to refund page in 07-05), order link.
- `/admin/payments` row link now points at `/admin/payments/[orderId]`
  (was /admin/orders). Added Gross/Fee/Net/Refunded columns; refund chip
  strip above date filter; status pill shows ' · partial' when partially
  refunded.
- `/admin/orders/[id]` inserts PaymentFinancialsPanel section above
  "Update status" for paid orders (paypalCaptureId IS NOT NULL).

## Verification

- `npx tsc --noEmit` exits 0.
- listAdminPayments still callable with no args (backwards compat).
- PaymentFinancialsPanel mobile classes verified: `grid-cols-2 lg:grid-cols-6`.
- Sandbox live test deferred to wave-end deploy.

## Deviations from Plan

**1. [Rule 2 - Critical] settle date proxy via updateTime**
- **Found during:** Task 1 SDK introspection
- **Issue:** `@paypal/paypal-server-sdk` v2.3.x has no explicit
  `settle_date` field on captures.
- **Fix:** Used `updateTime` as proxy when status=COMPLETED. Documented
  in CaptureDetails JSDoc.
- **Commit:** 405a8ba

**2. [Rule 1 - Bug] Refund chip SQL via raw `sql\`...\`` template**
- **Found during:** Task 1 query builder
- **Issue:** Comparing two decimal columns ('refunded_amount' vs
  'total_amount') — Drizzle's `lt()` / `gte()` accept literals only,
  not column references for both operands.
- **Fix:** Used `sql\`CAST(${a} AS DECIMAL(10,2)) > CAST(${b} AS DECIMAL(10,2))\``
  for precise comparison.
- **Commit:** 405a8ba

## Self-Check: PASSED

- src/actions/admin-payments.ts: FOUND (with new exports)
- src/app/(admin)/admin/payments/[orderId]/page.tsx: FOUND
- src/components/admin/payment-financials-panel.tsx: FOUND
- /admin/payments/page.tsx + /admin/orders/[id]/page.tsx: MODIFIED
- Commit 405a8ba: FOUND
