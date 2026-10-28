# Tracking status banding, mandatory weight, order_shipped notify

Three independent tasks, three branches, three PRs to `master`. Each branch
cut fresh from `origin/master`. Not stacked.

## Task 1 — `fix/tracking-status-banding`

Fix the debunked delivered/cancelled statusCode banding in
`src/lib/shipment-tracking.ts`. Two call sites carry the bug:

1. `buildTrackingView()` (~line 178-179): `delivered`/`cancelled` computed
   inline with `>= 400 && !== 500` / `=== 90`.
2. `bucketForStatusCode()` (~line 320): same debunked thresholds
   (`code === 90` cancelled, `code >= 400` delivered), consumed by
   `fallbackNote()` and by both `OrderTrackingTimeline` render paths
   (customer `order-tracking.tsx` and admin `order-shipment-panel.tsx`'s
   embedded `OrderTrackingTimeline`).

Fix: import `isDeliveredStatusCode` / `isCancelledStatusCode` from
`src/lib/delyva-delivery-status.ts` (already shipped, PR #223) at both call
sites. Do not re-derive a second copy of the logic. Update the stale
JSDoc/comment blocks describing the old banding.

**Extra finding (not in the original brief):** a THIRD, fully independent
copy of the exact same debunked banding lives in
`src/components/admin/order-shipment-panel.tsx` (~line 263-265):
```ts
const delivered = typeof status === "number" && status >= 400 && status !== 500;
const cancelled = status === 90;
```
This gates whether the admin sees "Cancel booking" for a shipment
(`{!cancelled && !delivered ? <CancelButton/> : null}`). Confirmed via grep
— only these two files in `src/` contain the pattern. Same defect family,
same file the task brief explicitly named as a consumer → fix inline under
deviation Rule 1 (auto-fix bugs), using the same shared helpers.

Add vitest cases per the brief (600 not delivered, 900 not delivered, 900
is cancelled, 700 is delivered, 110 is neither) to
`src/lib/shipment-tracking.test.ts` (new file).

## Task 2 — `feat/mandatory-product-weight`

Existing local branch, 5 commits, off `origin/master`, never pushed.
Verify `npx tsc --noEmit` clean, push as-is, open PR. No code changes unless
verification fails.

## Task 3 — `fix/order-shipped-manual-notify`

`src/actions/admin-orders.ts` status-change action needs to send the
`order_shipped` notification (email + WhatsApp) when an admin manually
transitions an order to `shipped`, mirroring the `order_processing` /
`order_approved` pattern already in that file. Guard against double-notify
(order already shipped, or `bookShipment` already sent it) using the
previous-status check, mirroring `shouldNotifyDelivered`'s pattern from
`delyva-delivery-status.ts`. Handle missing tracking/courier gracefully.
Log (not swallow) notification failures.

## Order of execution

Task 1 → Task 2 → Task 3, sequentially (shared working tree, one branch
checked out at a time). Each ends with push + PR open (no merge).
