---
phase: 20-admin-pos-draft-order-flow
plan: 05
subsystem: api
tags: [drizzle, mariadb, server-actions, pos, orders, coupons, shipping]

requires:
  - phase: 20-01
    provides: "assertValidTransition, isManualLine, ORDER_STATUS_FLOW, orders schema with paymentMethod + new statuses"
  - phase: 20-02
    provides: "Wave 1 schema + libs in place for Phase 20"

provides:
  - "getPosProductSearch: type-ahead search over active products (manual hydration)"
  - "getPosConfigFields: product_config_fields for configurable/keychain; null for stocked"
  - "getStockedVariantsForPos: slim variant projection with effective sale price"
  - "createPosOrder: atomic transaction writing orders + N order_items with coupon + shipping"
  - "setOrderAwaitingCustomer: pending -> awaiting_customer transition for send-draft modal"

affects:
  - "20-09 (POS UI) — imports createPosOrder, getPosProductSearch, getPosConfigFields, getStockedVariantsForPos"
  - "20-08, 20-11, 20-13 — consume isManualLine sentinel from orders.ts for rendering guards"

tech-stack:
  added: []
  patterns:
    - "CVE-2025-29927 requireAdmin() as first await in every exported function"
    - "MariaDB no-LATERAL: manual multi-query hydration (batch productVariants count, separate fetches joined in memory)"
    - "D-06 free-text sentinel: productId='manual' + variantId='manual' for free-text POS lines"
    - "D-21 paymentMethod=null on POS order insert (set at customer choice time)"
    - "D-23 setOrderAwaitingCustomer does NOT touch paymentLinks.usedAt"
    - "Atomic coupon redemption inside db.transaction so coupon rollback rolls back order"

key-files:
  created:
    - src/actions/admin-pos.ts
  modified: []

key-decisions:
  - "validateCoupon skipped (requires session user) — admin POS fetches coupon row directly via admin session, then uses applyCouponToSubtotal for validation before redeemCoupon inside the transaction"
  - "Dynamic imports removed in favour of static schema import for coupons table — cleaner, no runtime bundling edge cases"
  - "setOrderAwaitingCustomer uses db.query.orders.findFirst (no LATERAL risk — single row by PK) rather than a raw select to get typed status field"

patterns-established:
  - "Admin POS actions: requireAdmin() first, then validate inputs, then transaction wrapping all writes"
  - "Free-text sentinel (productId='manual', variantId='manual') is write-side; read-side guard is isManualLine from src/lib/orders.ts"

requirements-completed:
  - REQ-20-1
  - REQ-20-2
  - REQ-20-4
  - REQ-20-12

duration: 35min
completed: 2026-05-17
---

# Phase 20 Plan 05: Admin POS Server Actions Summary

**Five-function admin-pos.ts: type-ahead product search, config-field fetch, variant projection, atomic multi-line order creation with coupon + shipping, and pending-to-awaiting-customer transition**

## Performance

- **Duration:** 35 min
- **Started:** 2026-05-17T00:00:00Z
- **Completed:** 2026-05-17T00:35:00Z
- **Tasks:** 4 (Tasks 1-3 authored in one file; Task 4 committed)
- **Files modified:** 1

## Accomplishments

- Authored `src/actions/admin-pos.ts` with all 5 exported functions — each starting with `const session = await requireAdmin()` (CVE-2025-29927)
- `createPosOrder` wraps order insert + N order_items rows + atomic coupon redemption in a single `db.transaction`; free-text lines write `productId='manual'` + `variantId='manual'` sentinel (D-06); `paymentMethod: null` (D-21)
- `setOrderAwaitingCustomer` uses `assertValidTransition` guard before the DB update; never touches `paymentLinks.usedAt` (D-23)
- Zero LATERAL joins — all reads use manual multi-query hydration per MariaDB 10.11 rule

## Task Commits

1. **Tasks 1, 2, 3 — read helpers + createPosOrder + setOrderAwaitingCustomer** — `8eb33d6` (feat)
2. **Task 4 — commit** — same commit (single-file plan)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `src/actions/admin-pos.ts` — Five server actions: getPosProductSearch, getPosConfigFields, getStockedVariantsForPos, createPosOrder, setOrderAwaitingCustomer

## Decisions Made

- `validateCoupon` from `src/actions/coupons.ts` was not usable directly because it calls `getSessionUser()` which would block admin (already authed). Instead, the admin action fetches the coupon row directly with the already-validated admin session, computes discount via `applyCouponToSubtotal`, then calls `redeemCoupon` inside the transaction.
- Static import for `coupons` schema (removed an unnecessary dynamic import that crept into the first draft).
- `setOrderAwaitingCustomer` uses `db.query.orders.findFirst` (single-row PK lookup — no LATERAL risk) to get a typed status value before calling `assertValidTransition`.

## Deviations from Plan

None — plan executed exactly as written. The minor code cleanup (dynamic → static import, unused import removal) was normal first-draft tidying, not a deviation.

## Issues Encountered

- Pre-existing TypeScript error in `src/actions/payment-links.ts` line 249 (`instanceof` type error) — not introduced by this plan; verified via `git diff HEAD -- src/actions/payment-links.ts` (empty diff). Out of scope per deviation scope boundary rule.

## Known Stubs

None — this plan is server-action only; no UI rendering stubs.

## Threat Flags

None — all new endpoints are guarded by `requireAdmin()` as first await. No new unauthenticated surfaces introduced. `setOrderAwaitingCustomer` transitions status only; does not expose order data to callers.

## Next Phase Readiness

- Plan 20-09 (POS UI) can import `createPosOrder`, `getPosProductSearch`, `getPosConfigFields`, `getStockedVariantsForPos` from `@/actions/admin-pos` without further action authoring.
- `setOrderAwaitingCustomer` is ready for Plan 20-09 Task 4 (send-draft modal).
- Wave 3 (UI plans 20-09, 20-08, 20-11) can proceed.

## Self-Check

- [x] `src/actions/admin-pos.ts` exists
- [x] Commit `8eb33d6` exists on dev branch
- [x] `grep -c "await requireAdmin" src/actions/admin-pos.ts` = 5 (≥4 required)
- [x] `grep -c "db.query.*findMany.*with" src/actions/admin-pos.ts` = 0 (no LATERAL)
- [x] `npx tsc --noEmit` — only pre-existing error in payment-links.ts (unrelated)
- [x] `productId: "manual"` sentinel present (line 345)
- [x] `variantId: "manual"` sentinel present (line 346)
- [x] `paymentMethod: null` present (line 617)
- [x] `db.transaction` present (line 611)
- [x] `assertValidTransition(order.status, "awaiting_customer")` present (line 707)
- [x] `paymentLinks.usedAt` appears only in JSDoc comment (D-23 satisfied)

## Self-Check: PASSED

---
*Phase: 20-admin-pos-draft-order-flow*
*Completed: 2026-05-17*
