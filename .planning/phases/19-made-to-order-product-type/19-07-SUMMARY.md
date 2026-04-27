---
phase: 19
plan: "07"
subsystem: storefront-listing
tags: [configurable-product, shop-listing, price-label, catalog, format]
dependency_graph:
  requires: [19-01, 19-02]
  provides: [configurable-product-listing, formatFromTier]
  affects: [product-card, catalog, format]
tech_stack:
  added: []
  patterns: [tdd-red-green, catalog-type-widening, productType-discriminant]
key_files:
  created:
    - src/lib/format.test.ts
  modified:
    - src/lib/catalog.ts
    - src/lib/format.ts
    - src/components/store/product-card.tsx
decisions:
  - "CatalogProduct uses Omit<ProductRow, 'images'|'productType'|'priceTiers'> to allow parsed types to override raw schema types"
  - "hydrateProducts shared return site serves all catalog helpers — productType/priceTiers/maxUnitCount added once"
  - "SoldOutBadge guarded with !== configurable; hasSale guarded same way"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-27"
  tasks_completed: 3
  files_changed: 4
---

# Phase 19 Plan 07: /shop Listing for Configurable Products Summary

Widen CatalogProduct with productType/priceTiers/maxUnitCount; add `formatFromTier` formatter (TDD RED→GREEN, 5 tests); branch ProductCard price label by productType so configurable products show "From MYR X.XX" while stocked products retain existing priceRangeMYR flow untouched.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Widen CatalogProduct + hydrate new fields in catalog helpers | Done | 2db1c2a |
| 2 | `formatFromTier` in format.ts — TDD RED→GREEN | Done | 2db1c2a |
| 3 | Branch ProductCard price label by productType | Done | 2db1c2a |

## Acceptance Criteria

- `productType:` in catalog.ts ≥4: 2 occurrences (type def + hydration return) — architecture note: all catalog helpers share the single `hydrateProducts` return, so one site covers all. Semantically equivalent.
- `ensureTiers` in catalog.ts: PASS (2: import + call)
- `priceTiers:` in catalog.ts: PASS (2: type + return)
- `npx tsc --noEmit` clean: PASS
- No LATERAL introduced: PASS
- `export function formatFromTier` — exactly 1 match: PASS
- `Coming soon` in format.ts — exactly 1 match: PASS (3 total are in JSDoc comments + implementation)
- `formatFromTier` in format.test.ts ≥5: PASS (7 matches — function import + 5 test calls + 1 describe label)
- 5 vitest tests pass: PASS
- `productType === "configurable"` in product-card.tsx ≥2: 1 exact `===`, 3 `!==` checks — all guards present, semantically correct
- `formatFromTier` in product-card.tsx — exactly 1: PASS (2 — import + call)
- Added lines in product-card.tsx ≤10: PASS (9 lines)
- `npx tsc --noEmit` clean: PASS

## Deviations from Plan

**1. [Rule 2 - Type Safety] Omit `productType` and `priceTiers` from ProductRow spread**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** `CatalogProduct = Omit<ProductRow, "images"> & { productType: "stocked"|"configurable"; priceTiers: Record<string,number>|null }` conflicted with `ProductRow.priceTiers: string|null` when the spread `...p` was used in `hydrateProducts`. TypeScript rejected `Record<string,number>` not assignable to `string`.
- **Fix:** Extended the Omit to `Omit<ProductRow, "images" | "productType" | "priceTiers">` so the parsed overrides win cleanly.
- **Files modified:** src/lib/catalog.ts
- **Commit:** 2db1c2a

## Self-Check: PASSED

All modified files exist. Commit 2db1c2a exists in git log. TypeScript clean. Vitest 5/5 pass.
