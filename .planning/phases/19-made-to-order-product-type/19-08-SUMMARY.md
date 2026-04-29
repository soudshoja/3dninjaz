---
plan_id: 19-08
phase: 19
plan: 08
subsystem: cart
tags: [cart, configurable, zustand, hydration, made-to-order]
dependency_graph:
  requires: [19-01, 19-02, 19-06]
  provides: [configurable-cart-payload, cart-dedupe-by-hash, bag-ui-computedSummary]
  affects: [checkout, bag, cart-drawer]
tech_stack:
  added: [djb2-hash]
  patterns: [discriminated-union-cart, stable-stringify, storeKey-pattern]
key_files:
  created:
    - src/lib/config-hash.ts
    - src/lib/config-hash.test.ts
  modified:
    - src/stores/cart-store.ts
    - src/actions/cart.ts
    - src/components/store/cart-drawer.tsx
    - src/app/(store)/bag/page.tsx
    - src/components/checkout/paypal-provider.tsx
    - src/components/store/cart-line-row.tsx
    - src/components/store/configurable-product-view.tsx
decisions:
  - "Added storeKey field to HydratedCartItem so CartLineRow can call incrementItem/decrementItem/removeItem correctly for configurable lines (variantId is empty string for those)"
  - "hydrateCartItems signature changed from { variantId, quantity }[] to CartItem[] — callers updated to pass full storeItems"
  - "Ordering in hydrateCartItems preserves input cart-line order via post-hoc reorder pass"
metrics:
  duration: 35m
  completed: 2026-04-26
  tasks_completed: 4
  files_modified: 7
  files_created: 2
---

# Phase 19 Plan 08: Cart Payload + Dedupe for Configurable Products Summary

**One-liner:** Discriminated union cart store (StockedCartItem | ConfigurableCartItem) with djb2 hash-keyed dedupe, server hydration for configurable lines, and bag/drawer rendering via computedSummary.

## What Was Built

### src/lib/config-hash.ts (NEW)
Browser-safe pure-JS djb2 hash of ConfigurationData. `stableStringify` recursively sorts object keys so two configs differing only in key insertion order hash identically (D-11 / R4 mitigation). No `node:crypto` imports — runs in Zustand (browser) and server actions.

### src/stores/cart-store.ts (v3)
- `CartItem` is now `StockedCartItem | ConfigurableCartItem` discriminated union
- `isConfigurableCartItem` type-guard exported
- `addItem` dispatches on input shape — configurable path uses `hashConfigurationData` to key lines; stocked path byte-identical to Phase 16
- Version bumped 2→3 with no-op migration
- `storeKey` concept: stocked = variantId, configurable = `${productId}::${hash}`

### src/actions/cart.ts
- `hydrateCartItems` now accepts `CartItem[]` (discriminated union)
- Partitions stocked/configurable; runs separate DB queries; preserves original input order
- `HydratedCartItem` extended with `productType`, `configurationData?`, `storeKey`
- Configurable lines: `variantLabel = computedSummary`, `unitPrice = computedPrice.toFixed(2)`

### Caller updates
- `cart-drawer.tsx`, `bag/page.tsx`, `paypal-provider.tsx`: pass full `storeItems` to `hydrateCartItems`; use `storeKey` for live-id checks; React keys use `storeKey ?? variantId`
- `cart-line-row.tsx`: `const key = item.storeKey ?? item.variantId` for store operations
- `configurable-product-view.tsx`: replaced TODO stub with real `addItem({ productId, configurationData })` + `setDrawerOpen(true)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical field] Added storeKey to HydratedCartItem**
- **Found during:** Task 3/4 (caller updates)
- **Issue:** CartLineRow used `item.variantId` as store key for increment/decrement/remove; configurable lines have `variantId: ""` so all qty operations would be no-ops
- **Fix:** Added `storeKey: string` field to `HydratedCartItem`; stocked = variantId, configurable = item.key (`${productId}::${hash}`)
- **Files modified:** src/actions/cart.ts, src/components/store/cart-line-row.tsx

**2. [Rule 3 - Blocking] hydrateCartItems signature updated**
- **Found during:** Task 3 (updating callers)
- **Issue:** All callers (drawer, bag, paypal-provider) mapped storeItems to `{ variantId, quantity }` which TypeScript rejected after CartItem became a union
- **Fix:** Changed signature to accept `CartItem[]` directly; updated 3 callers; updated live-id check to use `storeKey` logic

## Self-Check

- src/lib/config-hash.ts: EXISTS
- src/lib/config-hash.test.ts: EXISTS
- src/stores/cart-store.ts: EXISTS, contains ConfigurableCartItem, isConfigurableCartItem, version: 3
- src/actions/cart.ts: EXISTS, contains productType: "configurable", productType: "stocked"
- Commit 63ab002: EXISTS

## Self-Check: PASSED
