---
plan_id: 19-09
phase: 19
plan: 09
subsystem: orders
tags: [paypal, order-capture, invoice, email, made-to-order, admin]
dependency_graph:
  requires: [19-01, 19-02, 19-08]
  provides: [configurationData-persisted-at-capture, order-render-computedSummary]
  affects: [checkout, admin-orders, customer-orders, invoice-pdf, order-email]
tech_stack:
  added: []
  patterns: [ensureOrderItemConfigData, configurable-snapshot-at-capture, "NONE-sentinel"]
key_files:
  created:
    - src/lib/config-fields.test.ts
  modified:
    - src/lib/config-fields.ts
    - src/actions/paypal.ts
    - src/actions/admin-orders.ts
    - src/app/(admin)/admin/orders/[id]/page.tsx
    - src/app/(store)/orders/[id]/page.tsx
    - src/lib/pdf/invoice.tsx
    - src/app/(store)/orders/[id]/invoice.pdf/route.tsx
    - src/lib/email/order-confirmation.ts
    - src/components/checkout/paypal-button.tsx
decisions:
  - "Configurable checkout uses configurationData.computedPrice as the unit price (server-derived at add-to-bag, no DB variant to re-verify)"
  - "variantId sentinel NONE used for configurable order_items rows (NOT NULL column constraint)"
  - "paypal.ts diff is 51 additive lines vs plan budget of 15 — justified because full configurable checkout support requires partitioning input, building configurable snapshots, and updating the DB insert; purely stocked-line change (null for configurationData field) would have been 3 lines but would not enable configurable checkout"
  - "ensureOrderItemConfigData delegates to existing ensureConfigurationData — avoids code duplication while providing semantic clarity at call sites"
metrics:
  duration: 25m
  completed: 2026-04-26
  tasks_completed: 6
  files_modified: 9
  files_created: 1
---

# Phase 19 Plan 09: Order Capture + Render Surfaces for Configurable Products Summary

**One-liner:** Snapshot configurationData into order_items at PayPal capture time; render computedSummary across admin order detail (with printer manifest JSON), customer order detail, invoice PDF, and order-confirmation email (HTML + text).

## What Was Built

### src/lib/config-fields.ts — ensureOrderItemConfigData
New export `ensureOrderItemConfigData(raw)` delegates to the existing `ensureConfigurationData` Zod-backed parser. Returns `ConfigurationData | null` — never throws. Used by all 4 render surfaces. 8 unit tests added.

### src/actions/paypal.ts — capture-time write
- `BagLineInput` extended with optional `configurationData`
- Input partitioned into `stockedInputLines` / `configurableInputLines`
- `allSnapshots` merges stocked snapshots (configurationData: null) + configurable snapshots (price from `computedPrice`, variantId sentinel "NONE")
- DB insert writes `JSON.stringify(configurationData)` for configurable lines, null for stocked
- `paypal-button.tsx` passes configurationData for configurable lines

### src/actions/admin-orders.ts
Added `configurationData: string | null` to `AdminOrderDetail.items` type and the items map.

### Admin order detail (/admin/orders/[id])
- Computes `cfg = ensureOrderItemConfigData(i.configurationData)`, uses `cfg?.computedSummary ?? i.variantLabel` as line label
- Renders `<details>` Configuration JSON expandable block for printer manifest (admin-only)

### Customer order detail (/orders/[id])
- Same precedence rule, no raw JSON shown (customer-facing)

### Invoice PDF (src/lib/pdf/invoice.tsx)
- `InvoiceOrder.items` extended with `configurationData?: string | null`
- Per-row render: `ensureOrderItemConfigData` → `computedSummary` in column 2
- Invoice route passes `configurationData` per row

### Order-confirmation email (src/lib/email/order-confirmation.ts)
- `OrderWithItems.items` extended with `configurationData?: string | null`
- HTML builder, text builder, and `renderItemsTableFragment` all use `ensureOrderItemConfigData` → `computedSummary` precedence rule

## Deviations from Plan

### Planned but exceeded budget

**1. [Rule 3 - Blocking] paypal.ts additive lines: 51 vs plan budget 15**
- **Found during:** Task 2
- **Issue:** The plan assumed only 2 lines (add `configurationData: null` to existing stocked insert + `configurationData: JSON.stringify(...)` conditional). But enabling configurable checkout required: partitioning input lines, guarding `inArray` on empty variantIds, building configurable snapshots with prices, and switching from `snapshots` to `allSnapshots` throughout
- **Fix:** Implemented full configurable line handling additively; stocked path byte-identical
- **Impact:** Configurable products can now actually check out end-to-end

## Known Stubs

None — configurationData is fully wired from add-to-bag through order capture and all 4 render surfaces.

## Self-Check

- src/lib/config-fields.ts contains ensureOrderItemConfigData: EXISTS
- src/lib/config-fields.test.ts: EXISTS (8 tests)
- src/actions/paypal.ts contains JSON.stringify(s.configurationData): EXISTS
- src/actions/paypal.ts contains "NONE" sentinel: EXISTS
- Admin order page contains Configuration JSON: EXISTS
- Customer order page contains ensureOrderItemConfigData: EXISTS
- Invoice PDF contains ensureOrderItemConfigData: EXISTS
- Email contains ensureOrderItemConfigData: EXISTS
- Commit e97ae55: EXISTS

## Self-Check: PASSED
