---
phase: quick-260705-dw2
plan: 01
subsystem: admin
tags: [products, admin, filesystem, variants, config-fields, drizzle, mysql2]

requires: []
provides:
  - "copyProductImages() filesystem helper (fs.cp physical directory copy + URL rewrite, traversal-guarded)"
  - "generateUniqueProductSlug() slug clash helper"
  - "duplicateProduct() server action — deep clone of any productType into a draft"
  - "cloneConfigFields() + cloneVariantTree() private clone helpers"
  - "Duplicate dropdown action on every admin product row"
affects: [admin-products, variant-product-system, configurator]

tech-stack:
  added: []
  patterns:
    - "Physical fs.cp directory copy (vs fs.rename move) for product image duplication, dedup by subdir"
    - "Fresh-id + id-map remap pattern for cloning FK-linked row trees (config fields, options, values, variants)"

key-files:
  created: []
  modified:
    - src/lib/storage.ts
    - src/actions/products.ts
    - src/app/(admin)/admin/products/product-row-actions.tsx

key-decisions:
  - "Duplicate is ALWAYS isActive=false regardless of source's active state"
  - "Variant SKUs are always freshly regenerated via generateVariantSku + batch-unique clash suffix — never copy v.sku verbatim"
  - "unitField is remapped through the cloneConfigFields id map (old field id -> new field id), or left null if no match"
  - "Order history, reviews, and wishlists are never cloned — clone is restricted to product-owned tables (products, product_config_fields, product_options, product_option_values, product_variants)"

requirements-completed: [DUP-01]

duration: ~35min
completed: 2026-07-05
---

# Quick Task 260705-dw2: Add Duplicate Product button to admin Summary

**One-click deep-clone of any product (stocked/configurable/keychain/vending/simple) into a new draft with physically-copied images and freshly regenerated variant SKUs.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-05T01:35:00Z (approx)
- **Completed:** 2026-07-05T02:11:12Z
- **Tasks:** 4/4 completed
- **Files modified:** 3

## Accomplishments

- Admins can now click "Duplicate" on any product row in `/admin/products` and land on the new product's edit page with all data cloned as a draft.
- Full clone coverage across all five `productType`s: stocked (options/values/variants tree with fresh SKUs), configurable/simple (inline config fields), keychain/vending (their locked config fields + tier pricing + `unitField` pointer).
- Images (product-level, per-variant, per-Select-option) are physically copied to a new `/uploads/products/<newId>/` folder tree — deleting the source product never breaks the duplicate.
- Order history, reviews, and wishlists are never touched by the clone.

## Task Commits

1. **Task 1: Add copyProductImages filesystem helper + unique-slug helper** - `571b285` (feat)
2. **Task 2: duplicateProduct core — products row clone + config-fields clone + unitField remap** - `a0b7949` (feat)
3. **Task 3: Clone options/values/variants tree with fresh unique SKUs** - `cb17b86` (feat)
4. **Task 4: Wire "Duplicate" menu item + redirect to new edit page** - `42219d7` (feat)

## Files Created/Modified

- `src/lib/storage.ts` - Added `copyProductImages(sourceProductId, destProductId, urls[])` — physically copies image directories (fs.cp, recursive) from the source product's bucket to the destination's bucket, with the same traversal guards (`safeBucket`, `path.resolve().startsWith(root)`) as `migrateNewImages`. Foreign/legacy URLs (not under the source's own bucket) pass through unrewritten. Dedupes already-copied subdirectories so the same source dir isn't copied twice (product image + variant imageUrl pointing at the same file). Never silently drops a URL on per-file error — logs and keeps the original.
- `src/actions/products.ts` - Added `generateUniqueProductSlug(name)` (reuses `slugify()` + DB `like`-query + `-2/-3` clash suffix), `cloneConfigFields(sourceId, destId)` (clones `product_config_fields` rows with fresh ids, rewrites Select-option `imageUrl`s via `copyProductImages`, returns an `oldFieldId -> newFieldId` map), `cloneVariantTree(sourceId, destId, destSlug)` (clones `product_options` -> `product_option_values` -> `product_variants` with fresh ids, remapped `option1..6ValueId` slots, physically copied variant `imageUrl`, and freshly generated batch-unique SKUs via `generateVariantSku`), and `duplicateProduct(productId)` (the public server action — `requireAdmin()` first await, clones the products row as an always-draft `(Copy)`-named unique-slug product, calls the two clone helpers, remaps `unitField`, revalidates admin/storefront paths).
- `src/app/(admin)/admin/products/product-row-actions.tsx` - Added a "Duplicate" dropdown item (Copy icon, above the Delete separator) that calls `duplicateProduct(id)` inside `startTransition` and redirects to `/admin/products/<newId>/edit` on success, or shows a `window.alert` on failure.

## Deviations from Plan

None — plan executed exactly as written. All file/function signatures matched the plan-checker-verified interfaces (schema columns, `ensureImagesV2`, `ensureConfigJson`, `generateVariantSku`, `ProductActionResult`).

## Decisions Made

- Duplicate is always a draft (`isActive: false`) regardless of the source's active state (hard constraint, honored as written).
- Variant SKUs are always freshly regenerated (never `v.sku` copied verbatim) with a batch-local clash suffix, matching the existing `variants.ts` clash-suffix convention.
- `unitField` is remapped through the `cloneConfigFields` id map; left `null` if the source's `unitField` doesn't resolve to a cloned field (defensive — shouldn't happen in practice since keychain/vending always seed their locked text field first).

## Known Stubs

None — no stubs introduced. The clone path is fully wired end-to-end (DB rows + physical image files + UI action + redirect).

## Threat Flags

None — no new security-relevant surface introduced beyond what's already covered by the plan's `<threat_model>` (T-dw2-01 through T-dw2-05, all mitigated/accepted as designed).

## Self-Check: PASSED

- FOUND: src/lib/storage.ts
- FOUND: src/actions/products.ts
- FOUND: src/app/(admin)/admin/products/product-row-actions.tsx
- FOUND: 571b285
- FOUND: a0b7949
- FOUND: cb17b86
- FOUND: 42219d7

`npx tsc --noEmit -p tsconfig.json` passes clean after every task and at final review.

## Next Steps

- Manual smoke test on dev (`app.3dninjaz.com`) per the plan's `<verification>` section: duplicate a stocked product with variants+images, a keychain product, a simple/configurable product, then delete the original and confirm the duplicate's images still load.
- No schema migration required — this quick task adds only application-layer clone logic on top of existing tables/columns.
