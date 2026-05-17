---
phase: "20"
plan: "09b"
subsystem: admin-pos
tags: [pos, pdp, product-detail, refactor, ux]
dependency_graph:
  requires:
    - 20-09 (original POS builder + line row)
    - 19-06 (ConfigurableProductView / SimpleProductView)
    - 16-04 (ProductDetail / VariantSelector)
  provides:
    - PosProductHydration server action
    - onAddToOrder prop on ProductDetail + children
    - POS-as-storefront UX
  affects:
    - src/actions/admin-pos.ts
    - src/components/store/product-detail.tsx
    - src/components/store/simple-product-view.tsx
    - src/components/store/configurable-product-view.tsx
    - src/components/admin/pos-line-row.tsx
    - src/components/admin/pos-builder.tsx
tech_stack:
  added: []
  patterns:
    - onAddToOrder additive optional prop pattern (customer PDP unaffected)
    - PDP reuse in admin context via prop injection
    - Hydration-fetch-on-pick async pattern in builder
key_files:
  created:
    - .planning/phases/20-admin-pos-draft-order-flow/20-09b-POS-PDP-REWORK-SUMMARY.md
  modified:
    - src/actions/admin-pos.ts
    - src/components/store/product-detail.tsx
    - src/components/store/simple-product-view.tsx
    - src/components/store/configurable-product-view.tsx
    - src/components/admin/pos-line-row.tsx
    - src/components/admin/pos-builder.tsx
decisions:
  - "Mount full customer PDP inside POS line row instead of a custom mini-configurator"
  - "onAddToOrder is an additive optional prop — undefined = existing cart behavior"
  - "fillState (filling/filled) embedded in LineWithId, not pos-builder top-level"
  - "Hydration data stripped from autosave, re-fetched on restore"
metrics:
  duration: "~45 minutes"
  completed: "2026-05-18"
  tasks: 4
  files: 6
---

# Phase 20 Plan 09b: POS PDP Rework Summary

## One-liner

Replaced the custom POS mini-configurator with full customer PDP reuse via an additive `onAddToOrder` callback prop threaded through `ProductDetail`, `SimpleProductView`, and `ConfigurableProductView`.

## Why

User feedback: "products in POS should display as they are in store." The old POS had a hand-rolled inline configurator (variant pills, custom colour picker, manual config field renders) that diverged from the real storefront UX. Admin picked products but saw a different interface than customers. Now the admin sees exactly what the customer sees — same gallery, same keychain live preview, same form fields — before adding a line.

## What changed

### 1. New server action: `getPosProductHydration(productId)` — `src/actions/admin-pos.ts`

Mirrors the server-side hydration in `src/app/(store)/products/[slug]/page.tsx`:
- Fetches product row (active OR inactive — admin sees all products)
- Resolves category name/slug
- Calls `hydrateProductVariants(productId)` for options + variants
- Calls `getConfigurableProductData(productId)` for configurable/keychain/vending/simple
- `pickImage` for all product images + per-variant pictures
- Returns `PosProductHydration` type (exported)
- First-awaits `requireAdmin()` per CVE-2025-29927

### 2. `onAddToOrder` on ProductDetail + children — additive optional prop

Added `PosAddToOrderLine` type export to `product-detail.tsx` (shared across all three components via import).

**ProductDetail (`product-detail.tsx`):**
- New prop `onAddToOrder?: (line: PosAddToOrderLine) => void`
- Threaded to `SimpleProductView` and `ConfigurableProductView`
- Stocked inline branch: when `onAddToOrder` is set, renders a direct button instead of `<AddToBagButton>` (which calls `useCartStore` internally and cannot be intercepted)
- When `onAddToOrder` is undefined: all branches fall through to existing cart-store behavior identically

**SimpleProductView (`simple-product-view.tsx`):**
- `handleAddToBag`: wrapped in `if (onAddToOrder) onAddToOrder(line); else addItem(...); setDrawerOpen(true)`
- Both variant branch and flat-price branch covered
- CTA label switches from "Add to Bag" to "Add to order" when `onAddToOrder` is set

**ConfigurableProductView (`configurable-product-view.tsx`):**
- `handleAddToBag`: same pattern — `if (onAddToOrder)` guard around cart-store call
- CTA label switches similarly

### 3. Rewritten `pos-line-row.tsx`

Deleted: all custom inline configurator code — variant pills, ColourPickerDialog calls, config field renders, `getPosConfigFields` / `getStockedVariantsForPos` calls, expand/collapse toggle.

New two-state design:

**"filling" state** (initial after product pick):
- Blue 2px branded border
- Header strip with product name + trash
- Mounts full `<ProductDetail>` with `onAddToOrder={handlePdpAddToOrder}`
- `handlePdpAddToOrder` translates `PosAddToOrderLine` → `PosLineStocked | PosLineConfigurable`, merges UI fields (`hydration`, `fillState: "filled"`, `filledLine`), and calls `onChange`

**"filled" state** (after "Add to order" fires):
- 56px compact row: 40×40 thumb (or icon fallback) · product name · variant/config subtitle · qty stepper (–/N/+) · RM unit price input (purple-50 tint when overridden) · line total · Edit pencil · trash
- "Edit" button reopens "filling" mode (sets `fillState: "filling"`)

Free-text lines: always "filled" (manual compact form, never mount PDP).

### 4. Updated `pos-builder.tsx`

- `LineWithId` type extended with `hydration?`, `fillState?`, `filledLine?` UI-only fields
- `addProductLine`: after adding line in "filling" state, calls `getPosProductHydration(id).then(...)` to patch hydration async
- `updateLine`: preserves hydration/fillState/filledLine when merging
- Submit: strips UI-only fields before `createPosOrder`
- Autosave: strips `hydration` (not useful to persist; re-fetched on restore)
- `handleRestoreDraft`: re-fetches hydration for all product lines after restore
- Removed `expandedLineId` state (no longer needed)
- `PosLineRow` call: removed `isExpanded` / `onToggleExpand` props

### 5. Dead code removed — `src/actions/admin-pos.ts`

- `getPosConfigFields` — 0 external callers after rework
- `getStockedVariantsForPos` — 0 external callers after rework
- `PosConfigField` type — only used by deleted function
- `PosVariant` type — only used by deleted function
- `productConfigFields` schema import — no longer needed

## Customer PDP regression test

`onAddToOrder` is additive optional (default `undefined`). All three customer-facing render paths check `if (onAddToOrder) ... else [existing cart behavior]`. The customer PDP at `/products/[slug]` never passes this prop — it continues to call `useCartStore.addItem()` and `setDrawerOpen(true)` exactly as before.

TypeScript: `npx tsc --noEmit` exits 0 (verified before each commit).

Grep verification:
- `grep -n "getPosConfigFields|getStockedVariantsForPos" src/components/admin/pos-*.tsx` → 0 lines (PASS)
- `grep -c "onAddToOrder" product-detail.tsx simple-product-view.tsx configurable-product-view.tsx` → 9 / 7 / 5 (PASS, ≥3 per file)

## Commits

| Hash | Message |
|------|---------|
| 6f1bc29 | feat(pos): new getPosProductHydration server action |
| 3506e4c | feat(store): onAddToOrder optional callback on ProductDetail + children |
| 66311f7 | feat(pos): mount customer PDP in line row, rip custom configurator |
| 368a673 | chore(pos): remove dead getPosConfigFields + getStockedVariantsForPos |

## Open follow-ups

- Sticky mobile CTA bar from PDP renders at the bottom of the POS page in "filling" mode — may want to suppress `lg:hidden fixed bottom-0` CTA when mounted inside POS (CSS containment or a prop like `noPosStickyCta`). Low priority — admin typically uses desktop.
- The "Add to order" button in PDP shows WishlistButton next to it in the stocked inline branch — the wishlist heart is harmless in POS context but visually noisy. Can strip with a `hideWishlist` prop if needed.

## Self-Check: PASSED

- src/actions/admin-pos.ts: exists, contains `getPosProductHydration`
- src/components/store/product-detail.tsx: exists, contains `onAddToOrder`
- src/components/store/simple-product-view.tsx: exists, contains `onAddToOrder`
- src/components/store/configurable-product-view.tsx: exists, contains `onAddToOrder`
- src/components/admin/pos-line-row.tsx: exists, mounts `ProductDetail`
- src/components/admin/pos-builder.tsx: exists, calls `getPosProductHydration`
- Commits 6f1bc29, 3506e4c, 66311f7, 368a673 all present in git log
