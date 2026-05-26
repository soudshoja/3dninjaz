---
quick_task: 260525-xbb
plan: 01
completed: 2026-05-26
branch: feat/per-sku-shipping-weight
tags: [shipping, configurable-products, delyva, weight-resolution]
key_files:
  created:
    - src/lib/option-weight.ts
    - src/lib/__tests__/option-weight-resolution.test.ts
  modified:
    - src/lib/config-fields.ts
    - src/components/admin/config-field-modal.tsx
    - src/actions/shipping-quote.ts
    - src/components/checkout/shipping-rate-picker.tsx
    - src/components/admin/pos-builder.tsx
    - src/actions/shipping.ts
commits:
  - hash: 497fefb
    message: "feat(shipping): add optional weight (g) to Select option schema + admin editor"
  - hash: 6bda4c0
    message: "feat(shipping): resolve per-option weight in quoteForCart as Tier 0 (checkout + POS)"
  - hash: 20113be
    message: "feat(shipping): resolve per-option weight in sumOrderWeight as Tier 0 (admin booking)"
requirements_closed:
  - SKU-WEIGHT-SCHEMA
  - SKU-WEIGHT-ADMIN-UI
  - SKU-WEIGHT-RESOLUTION-CHECKOUT
  - SKU-WEIGHT-RESOLUTION-BOOKING
---

# Quick Task 260525-xbb: Per-SKU Select Option Shipping Weight

**One-liner:** Per-option shipping weight in grams added to Select field schema + admin editor, resolved as Tier 0 in both checkout quoteForCart and admin sumOrderWeight via server-side DB re-read, with a 15-test unit suite proving heavier-option > lighter-option precedence.

## Tasks Completed

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Add optional grams `weight` to Select option schema + admin editor | `497fefb` | DONE |
| 2 | Resolve selected-option weight in quoteForCart (checkout + POS) | `6bda4c0` | DONE |
| 3 | Resolve option weight in sumOrderWeight from order_item snapshot | `20113be` | DONE |

## What Was Built

### Task 1 — Schema + Admin Editor
- `SelectFieldConfig.options` gets `weight?: number` (grams, optional, backward compatible)
- `SelectFieldConfigSchema` validates weight as `z.number().int().min(0).max(50_000).optional()`
- Old options without weight still parse (backward compat)
- `config-field-modal.tsx` SelectOptionsEditor: added 88px "Weight g" column (both header and row grid)
- Numeric input per option row with `min=0 step=1`, persists via existing `updateOption -> onChange` autosave chain

### Task 2 — quoteForCart + checkout + POS wiring
- New pure helper `src/lib/option-weight.ts` exports `resolveOptionWeightKg(configValues, fieldsForProduct)` — no server-only boundary, importable by tests
- `shipping-quote.ts` re-exports the helper + `FieldWeightEntry` type for callers
- `CartItemForQuote` gets `configValues?: Record<string, string>` (T-17-09 safe: only string option values, grams live in DB)
- Batch config-field fetch in `quoteForCart`: `inArray(productConfigFields.productId, configProductIds)` (no LATERAL), builds `fieldsByProduct` map
- Tier 0 applied per-line before the existing variant→product→fallback ladder
- `shipping-rate-picker.tsx`: forwards `configValues: i.configurationData?.values` (real object, direct `.values`)
- Debounce key includes `configValues` so changing a Select option triggers a re-quote
- `pos-builder.tsx`: imports `ensureConfigurationData`; for `kind === "configurable"` lines, parses `(l as PosLineConfigurable).configurationData` (JSON string) before reading `.values`
- 15-test unit suite in `option-weight-resolution.test.ts`

### Task 3 — sumOrderWeight (admin booking)
- Same Tier 0 pattern: batch-fetch select config fields for items with `configurationData` snapshot
- Parses `i.configurationData` (LONGTEXT JSON string) via `ensureConfigurationData()` before reading `.values`
- `resolveOptionWeightKg` applied as Tier 0; null falls through to variant→product→fallback unchanged
- TODO comment: `bookShipmentForOrder` inventory weight ladder not mirrored (out of scope per plan)

## Verification Results

```
npx vitest run src/lib/__tests__/option-weight-resolution.test.ts
  Test Files  1 passed (1)
      Tests  15 passed (15)

npx tsc --noEmit
  (no output — clean)
```

## Deviations from Plan

### Auto-fixed: Pure helper extracted to separate file (not inline in shipping-quote.ts)

**Found during:** Task 2 test run
**Issue:** `shipping-quote.ts` uses `"use server"` and `import "server-only"`. Vitest cannot import it: `Error: This module cannot be imported from a Client Component module`.
**Fix:** Extracted `resolveOptionWeightKg` + `FieldWeightEntry` to `src/lib/option-weight.ts` (no server-only, pure function). Re-exported from `shipping-quote.ts` to satisfy plan's contract ("exported named export"). Test imports from `@/lib/option-weight` instead of `@/actions/shipping-quote`.
**Impact:** Zero functional change. The plan intended the helper to be testable — this is the correct shape. All 15 tests pass.

### Pre-existing: No ESLint config in project

**Found during:** Task 3 verify
**Issue:** `npx eslint src/actions/shipping.ts` fails with "ESLint couldn't find an eslint.config.js file" — ESLint v9 config format not set up in this project.
**Action:** Skipped (pre-existing; not caused by this task). tsc is clean which is the material correctness check.

## Threat Model Compliance

| Threat ID | Status |
|-----------|--------|
| T-17-09 | PRESERVED — `configValues` carries only string option values. Grams are re-read from `productConfigFields.configJson` server-side. No client-supplied numeric weight is ever used. |
| T-xbb-02 | ACCEPTED — one extra batched inArray query per quoteForCart call; bounded. |
| T-xbb-03 | ACCEPTED — customer picks a real option value; weight from that option is the correct weight. |

## Follow-up Todos (from plan)

1. Mirror `resolveOptionWeightKg` into `bookShipmentForOrder` inventory weight ladder if per-parcel weight accuracy at booking time is required.
2. Keychain / tier-priced configurable products have no Select field — per-SKU weight does not apply; revisit if those products need real shipping weight.

## Known Stubs

None — no hardcoded empty values or placeholder data introduced.

## Self-Check

- [x] `src/lib/option-weight.ts` exists
- [x] `src/lib/__tests__/option-weight-resolution.test.ts` exists
- [x] Commits `497fefb`, `6bda4c0`, `20113be` exist on `feat/per-sku-shipping-weight`
- [x] 15 tests pass
- [x] tsc clean
