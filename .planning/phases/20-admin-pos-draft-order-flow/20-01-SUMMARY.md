---
phase: 20-admin-pos-draft-order-flow
plan: 01
subsystem: database
tags: [drizzle, mariadb, order-status, schema, payment-proofs, bank-transfer]

# Dependency graph
requires:
  - phase: 07-manual-orders-paypal
    provides: "orders table + orderStatusValues + ORDER_STATUS_FLOW + assertValidTransition"
  - phase: 19-made-to-order-product-type
    provides: "configurationData pattern in order_items; product type enum"
provides:
  - "OrderStatus type widened to 8 values (awaiting_customer + awaiting_payment_review)"
  - "ORDER_STATUS_FLOW edges for POS draft/bank-transfer transitions"
  - "isManualLine(item) helper for sentinel-based manual line detection"
  - "orders.payment_method nullable enum column (Drizzle mirror)"
  - "storeSettings bank detail columns (bankName/bankAccountNumber/bankAccountHolder/draftLinkTemplate)"
  - "paymentProofs mysqlTable + paymentProofsRelations"
  - "char + datetime imported in schema.ts for Phase 20 use"
affects:
  - "20-02-PLAN.md (migration applicator reads these Drizzle definitions)"
  - "20-03+ (all Phase 20 plans that import OrderStatus or paymentProofs)"
  - "Any plan that renders an order status badge or the status transition form"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-06/D-07: 'manual' string sentinel for free-text POS lines in order_items (no new column needed)"
    - "D-19: orderStatusValues array is the single source of truth for the DB ENUM + TS type + validators"
    - "datetime + sql CURRENT_TIMESTAMP for non-timestamp datetime columns (MariaDB quirk: datetime does not support .defaultNow())"

key-files:
  created: []
  modified:
    - "src/lib/orders.ts"
    - "src/lib/db/schema.ts"
    - "src/components/admin/admin-order-status-badge.tsx"
    - "src/components/admin/admin-order-status-form.tsx"
    - "src/components/orders/order-status-badge.tsx"

key-decisions:
  - "D-19: orderStatusValues array drives both the DB ENUM (via migration) and the TS OrderStatus union — single source of truth"
  - "D-20: ORDER_STATUS_FLOW gains pending→awaiting_customer, awaiting_customer→{awaiting_payment_review,paid,cancelled}, awaiting_payment_review→{paid,awaiting_customer,cancelled}"
  - "D-06/D-07: sentinel 'manual' string (both productId + variantId) identifies free-text POS lines; isManualLine() is the canonical check"
  - "D-22: paymentProofs uses char(36) PKs + datetime (not timestamp) for DATETIME DB type; createdAt uses sql CURRENT_TIMESTAMP default"
  - "Rule 1 deviation: status badge/form components required simultaneous update because Record<OrderStatus,…> is exhaustive — TypeScript compilation blocked until all 8 statuses were covered"

patterns-established:
  - "Exhaustive Record<OrderStatus, …> maps in badge/form components MUST be updated every time OrderStatus gains new literals"
  - "datetime('…').default(sql`CURRENT_TIMESTAMP`) is the correct Drizzle pattern for MariaDB DATETIME columns needing a default (not .defaultNow() which only exists on timestamp)"

requirements-completed:
  - REQ-20-3
  - REQ-20-4
  - REQ-20-5
  - REQ-20-10
  - REQ-20-2

# Metrics
duration: 25min
completed: 2026-05-17
---

# Phase 20 Plan 01: Schema + Orders Foundation Summary

**OrderStatus widened to 8 values, paymentProofs table + bank-detail columns mirrored in Drizzle, and isManualLine sentinel helper added — all downstream Phase 20 plans now have type-safe contracts to compile against.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-17T13:30:00Z
- **Completed:** 2026-05-17T14:00:00Z
- **Tasks:** 3 (Tasks 1-2 source changes, Task 3 commit)
- **Files modified:** 5

## Accomplishments

- `OrderStatus` union and `ORDER_STATUS_FLOW` extended with `awaiting_customer` and `awaiting_payment_review` statuses for the POS + bank-transfer draft flow
- `isManualLine` helper exported from `src/lib/orders.ts` for sentinel-based free-text line detection
- Drizzle schema fully mirrors all Phase 20 DB additions: `orders.paymentMethod`, `storeSettings` bank columns, `paymentProofs` table with indexes and relation

## Task Commits

1. **Task 1: Extend OrderStatus + ORDER_STATUS_FLOW + add isManualLine** - part of `cb1a612` (feat)
2. **Task 2: Mirror all Phase 20 schema additions in schema.ts** - part of `cb1a612` (feat)
3. **Task 3: Commit Plan 20-01** - `cb1a612` (feat)

## Files Created/Modified

- `src/lib/orders.ts` — OrderStatus type widened (8 values), ORDER_STATUS_FLOW extended (3 new edges), isManualLine exported
- `src/lib/db/schema.ts` — orderStatusValues expanded; char + datetime imported; orders.paymentMethod + storeSettings bank columns + paymentProofs table + paymentProofsRelations added; ordersRelations updated with paymentProofs many side
- `src/components/admin/admin-order-status-badge.tsx` — STATUS_THEME map extended with awaiting_customer + awaiting_payment_review (amber palette)
- `src/components/admin/admin-order-status-form.tsx` — LABELS map extended with two new statuses
- `src/components/orders/order-status-badge.tsx` — PALETTE map extended with two new statuses

## Decisions Made

- `datetime` columns use `.default(sql\`CURRENT_TIMESTAMP\`)` because `datetime` from `drizzle-orm/mysql-core` does not expose `.defaultNow()` (that method only exists on `timestamp`). This is a MariaDB quirk not documented in Drizzle's main docs.
- `char` and `datetime` were added to the top-level import in schema.ts (they were not previously used in the file).
- `paymentProofs` declared without an explicit FK reference in Drizzle (FK is enforced at the live DB level via `phase20-migrate.cjs` with `ON DELETE CASCADE`) — consistent with the `orderShipments` pattern in the same file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Status badge/form components failed tsc with exhaustive Record gaps**
- **Found during:** Task 1 (TypeScript check after extending OrderStatus)
- **Issue:** Three components use `Record<OrderStatus, …>` which TypeScript enforces exhaustively. Adding two new literals to `OrderStatus` made all three fail with TS2739 "missing the following properties: awaiting_customer, awaiting_payment_review".
- **Fix:** Added amber-tinted entries for both new statuses to `STATUS_THEME` (admin badge), `LABELS` (admin status form), and `PALETTE` (customer order badge). Color choice: `#fef3c7` bg + `#92400e` fg (amber-100 / amber-800) to visually distinguish "waiting on human action" from paid/processing blue.
- **Files modified:** `src/components/admin/admin-order-status-badge.tsx`, `src/components/admin/admin-order-status-form.tsx`, `src/components/orders/order-status-badge.tsx`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `cb1a612` (same atomic commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - exhaustive type map)
**Impact on plan:** Required fix — TypeScript compilation was blocked without it. All three files directly use `Record<OrderStatus, …>`, so the fix is mechanical and scope-contained. No new features or logic added to those components.

## Issues Encountered

- Linter/formatter reverted `src/lib/orders.ts` and `src/lib/db/schema.ts` mid-edit (CRLF + import-in-middle-of-file issues). Resolved by writing orders.ts as a full Write, and placing `char`/`datetime` imports in the top import block before making schema body edits.
- `datetime` column type does not expose `.defaultNow()` in Drizzle (unlike `timestamp`). Used `.default(sql\`CURRENT_TIMESTAMP\`)` instead — see Patterns Established above.

## User Setup Required

None — this plan is schema-mirror only. No live DB writes. Migration is Plan 20-02's job.

## Next Phase Readiness

- Plan 20-02 (migration applicator) can now safely `require('./src/lib/db/schema')` and see `paymentProofs`, `orderStatusValues` (8 values), and the extended `storeSettings` shape without TypeScript errors.
- All Phase 20 plans that import `OrderStatus`, `assertValidTransition`, or `isManualLine` are unblocked.
- Status badge components already show correct amber labels for the two new statuses — storefront + admin order detail pages will render correctly the moment 20-02 applies the live ENUM.

---

*Phase: 20-admin-pos-draft-order-flow*
*Completed: 2026-05-17*
