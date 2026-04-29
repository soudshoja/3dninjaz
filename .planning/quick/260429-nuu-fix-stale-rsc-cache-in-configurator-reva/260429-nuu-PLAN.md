---
id: 260429-nuu
title: "Fix stale RSC cache in configurator — revalidatePath PDP on color field changes"
status: in-progress
date: 2026-04-29
---

# Fix stale RSC cache in configurator

## Problem

Color palette changes saved via admin configurator do not propagate to storefront PDP (`/products/<slug>`). Root cause: `addConfigField`, `updateConfigField`, `deleteConfigField` in `src/actions/configurator.ts` only call `revalidatePath` for the admin configurator page. Next.js RSC cache for the storefront PDP is never busted, so users see stale color data until cache expires or server restarts.

`saveTierTable` (line 484-485) is the only mutation that does revalidate the PDP — that's why price changes propagate but color/option changes don't.

## Tasks

### Task 1 — addConfigField PDP revalidation

**File:** `src/actions/configurator.ts:248`

After existing `revalidatePath('/admin/products/${productId}/configurator')`, fetch product slug and revalidate PDP:

```ts
const [prod] = await db
  .select({ slug: products.slug })
  .from(products)
  .where(eq(products.id, productId))
  .limit(1);
if (prod) revalidatePath(`/products/${prod.slug}`);
```

**Verify:** add a color field via admin → storefront PDP shows new colors without server restart.

### Task 2 — updateConfigField PDP revalidation

**File:** `src/actions/configurator.ts:310`

Same pattern but use `existing.productId` (already fetched at line 274-278). Insert slug query after existing revalidatePath.

**Verify:** edit color allowedColorIds via admin → storefront PDP reflects new palette.

### Task 3 — deleteConfigField PDP revalidation

**File:** `src/actions/configurator.ts:338-340`

`existing` already has productId. Add slug fetch + PDP revalidation inside the existing `if (existing?.productId)` block.

**Verify:** delete a color field → storefront PDP no longer shows it.

## Out of scope

- `reorderConfigFields` (line 391) — same gap but reorder rarely affects color values; tracked as follow-up
- Color storage format / parse layer — RSC cache is the bug, data layer is fine
