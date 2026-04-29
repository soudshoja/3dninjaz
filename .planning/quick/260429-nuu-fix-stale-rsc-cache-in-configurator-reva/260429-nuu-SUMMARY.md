---
id: 260429-nuu
title: "Fix stale RSC cache in configurator — revalidatePath PDP on color field changes"
status: complete
date: 2026-04-29
commit: 2056a11
---

# Summary

Color palette changes saved via admin configurator (`/admin/products/[id]/configurator`) were not propagating to the storefront PDP at `/products/[slug]`. Root cause: the three field-mutation server actions in `src/actions/configurator.ts` only invalidated the admin route's RSC cache. Bug confirmed on `https://app.3dninjaz.com/products/pancake-clicker-mogqlfp6`.

## Changes

`src/actions/configurator.ts` — three sites updated, all mirror the pattern already in `saveTierTable` (line 484-485):

| Action | Before | After |
|---|---|---|
| `addConfigField` (~L248) | `revalidatePath('/admin/products/${productId}/configurator')` only | + slug fetch via `productId` + `revalidatePath('/products/${slug}')` |
| `updateConfigField` (~L310) | admin path only | + slug fetch via `existing.productId` + PDP revalidate |
| `deleteConfigField` (~L338) | admin path only (inside `if (existing?.productId)`) | + slug fetch + PDP revalidate inside same block |

Each adds 5 lines (slug select + conditional revalidate). Total diff: ~15 lines.

## Verification

- `grep -n 'revalidatePath\(\`/products/' src/actions/configurator.ts` → 4 hits (3 new + saveTierTable)
- Manual test path: admin edits a Colour field's `allowedColorIds` → saves → storefront PDP shows new palette without server restart

## Out of scope

- `reorderConfigFields` (~L391) has the same gap. Not fixed: reorder rarely changes color values, and user scope was the 3 listed actions. Track as follow-up if reorder visibility matters.
- No data-layer changes — JSON parse, color storage, hydration all untouched.

## Commit

`2056a11` — fix(configurator): revalidate storefront PDP on color/option field changes
