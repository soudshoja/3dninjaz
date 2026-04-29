---
phase: 19
plan: "06"
subsystem: storefront-pdp
tags: [configurable-product, pdp, keychain-preview, configurator-form, made-to-order]
dependency_graph:
  requires: [19-01, 19-02]
  provides: [configurable-pdp-components, public-config-hydration]
  affects: [product-detail, slug-page]
tech_stack:
  added: []
  patterns: [manual-multi-query-hydration, discriminator-branch, hero-swap-on-touch]
key_files:
  created:
    - src/lib/configurable-product-data.ts
    - src/components/store/keychain-preview.tsx
    - src/components/store/configurator-form.tsx
    - src/components/store/configurable-image-gallery.tsx
    - src/components/store/configurable-product-view.tsx
  modified:
    - src/components/store/product-detail.tsx
    - src/app/(store)/products/[slug]/page.tsx
decisions:
  - "D-14 discriminator branch: 8 additive lines in product-detail.tsx (2 imports + 2 type fields + 1 destructure + 3 early-return block)"
  - "D-11 add-to-bag stub: console.info placeholder; Plan 19-08 wires cart store"
  - "resolvedColours batch-fetched in ONE query for all colour fields (inArray)"
  - "Admin-only colour fields (code/previousHex/family*) never leave server boundary"
metrics:
  duration: "~45 minutes"
  completed: "2026-04-27"
  tasks_completed: 6
  files_changed: 7
---

# Phase 19 Plan 06: Storefront PDP for Configurable Products Summary

Server-side hydration helper + 4 new storefront components + discriminator branch in product-detail.tsx routing configurable products to ConfigurableProductView with live KeychainPreview, type-dispatched ConfiguratorForm, tier-price meter, and hero-swap on first interaction.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | src/lib/configurable-product-data.ts — public hydration helper | Done | 286ea66 |
| 2 | src/components/store/keychain-preview.tsx — generic SVG name strip | Done | 286ea66 |
| 3 | src/components/store/configurator-form.tsx — type-dispatched inputs | Done | 286ea66 |
| 4 | src/components/store/configurable-image-gallery.tsx — hero + thumbstrip | Done | 286ea66 |
| 5 | src/components/store/configurable-product-view.tsx — orchestrator | Done | 286ea66 |
| 6 | PDP wiring — discriminator branch + RSC fetch | Done | 286ea66 |

## Acceptance Criteria

- `import "server-only"` on line 1 of configurable-product-data.ts: PASS (1 match)
- `ensureConfigJson` called: PASS (4 occurrences)
- `inArray(colors.id` — single batch query: PASS (1 match)
- Admin-only fields never leak: PASS (3 matches are all in comments, zero in code projections)
- No LATERAL (db.query.findMany with:): PASS (0 matches)
- `viewBox` in keychain-preview: PASS (2 matches)
- `fill={baseHex}` + `fill={letterHex}` present: PASS (lines 85, 107)
- `aria-label` in keychain-preview: PASS (1 match)
- `ConfigurableProductView` import + JSX in product-detail.tsx: PASS
- `productType === "configurable"` discriminant: PASS (1 match — logic line)
- D-14 additive lines in product-detail.tsx: 8 lines (2 imports + type fields + destructure + 3-line early return)
- cart-store.ts untouched: PASS (0 diff lines)
- variant-editor.tsx + variants.ts untouched: PASS (0 diff lines)
- `getConfigurableProductData` in slug page: PASS
- `npx tsc --noEmit`: PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TextFieldConfig has no `helpText` property**
- **Found during:** Task 3 (TypeScript check)
- **Issue:** configurator-form.tsx used `cfg.helpText` on a `TextFieldConfig` object, but `TextFieldConfig` only has `maxLength/allowedChars/uppercase/profanityCheck`. Help text lives on the `PublicConfigField.helpText` field.
- **Fix:** Changed `cfg.helpText ?? field.helpText` to `field.helpText` (field-level, not config-level).
- **Files modified:** src/components/store/configurator-form.tsx
- **Commit:** 286ea66

## Known Stubs

- `handleAddToBag` in configurable-product-view.tsx calls `console.info("[19-06] add stub")` instead of cart-store mutation. Plan 19-08 will replace this with `useCartStore.getState().addConfigurableItem(...)`. The button UI is fully functional (disabled/enabled states, price display).

## Self-Check: PASSED

All created files exist on disk. Both commits (286ea66) exist in git log. TypeScript clean.
