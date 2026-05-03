---
status: diagnosed
trigger: "Investigate why variants get deleted/regenerated on the admin products variants page"
created: 2026-05-03T00:00:00.000Z
updated: 2026-05-03T00:15:00.000Z
---

## Current Focus

**Root Cause Identified:**
The product edit form passes `variants: []` to `updateProduct`, which deletes ALL existing variants and re-inserts an empty array.

**Fix Required:** Modify `updateProduct` to only delete/re-insert variants when the variants array is non-empty, or modify the edit form to include variant data.

**Next Action:** Implement fix and verify

## Symptoms

expected: Variants persist across product saves, only new missing variants are added by "Generate Variant Matrix"
actual: User reports variants appear to be deleted and need regeneration
errors: None reported - appears to be UI/regeneration behavior
reproduction: Navigate to /admin/products/[id]/variants, make changes or save product from edit page
started: Issue existed before auto-save implementation (commit 1ff292d)
always_broken: Yes - behavior has been present since initial variant system design

## Eliminated

- hypothesis: "Auto-save draft is corrupting variant data"
  evidence: Draft restore only happens when banner is shown, and it restores from localStorage. The draft includes options+variants+rowEdits shape that matches the UI state. The issue existed before auto-save commit.
  timestamp: 2026-05-03T00:05:00.000Z

- hypothesis: "Database variants are being deleted"
  evidence: The database schema has ON DELETE CASCADE for productVariants on productId, but variants are only deleted when explicitly calling deleteProduct or when updateProduct replaces all variants. The variants page does not delete variants.
  timestamp: 2026-05-03T00:06:00.000Z

- hypothesis: "generateVariantMatrix is deleting existing variants"
  evidence: generateVariantMatrix only inserts MISSING variants - it checks existingVariants and skips duplicates. It never deletes.
  timestamp: 2026-05-03T00:07:00.000Z

## Evidence

- timestamp: 2026-05-03T00:02:00.000Z
  checked: src/actions/products.ts line 516-564
  found: updateProduct function always deletes ALL variants before re-inserting:
    ```typescript
    // Replace variants: delete old, insert new. Simpler and correct than diffing.
    await db.delete(productVariants).where(eq(productVariants.productId, id));
    ```
  implication: When admin saves product from edit page, ALL variants are deleted and re-inserted

- timestamp: 2026-05-03T00:03:00.000Z
  checked: src/components/admin/variant-editor.tsx - restoreDraft function
  found: Draft restoration replaces server data with localStorage data, including stale options
  implication: If localStorage draft is old, variants may not match current database state

- timestamp: 2026-05-03T00:04:00.000Z
  checked: src/lib/variants.ts hydrateProductVariants function
  found: Uses 3 queries (options, values, variants) with manual hydration for MariaDB compatibility
  implication: No LATERAL joins, so variants query is independent

- timestamp: 2026-05-03T00:08:00.000Z
  checked: src/actions/variants.ts generateVariantMatrix function
  found: Only inserts MISSING variants - fetches existingVariants and uses existingKey() to check for duplicates
  implication: Generate matrix should NOT regenerate existing variants

- timestamp: 2026-05-03T00:09:00.000Z
  checked: src/components/admin/product-form.tsx line 332
  found: `variants: []` is passed in the payload when calling updateProduct
  implication: When editing a product, ALL variants are deleted and replaced with an empty array

- timestamp: 2026-05-03T00:10:00.000Z
  checked: src/actions/products.ts line 516-564 updateProduct function
  found: Always deletes all variants with `db.delete(productVariants).where(eq(productVariants.productId, id))` then re-inserts based on variants.length > 0 check
  implication: The "Replace variants" logic is correct but the form is passing an empty array, causing deletion

## Resolution

root_cause: **The product edit form (`src/components/admin/product-form.tsx` line 332) passes `variants: []` when calling `updateProduct`. This causes the `updateProduct` function in `src/actions/products.ts` to delete ALL existing variants and re-insert an empty array.**

The variants ARE actually deleted from the database permanently when:
1. Admin goes to `/admin/products/[id]/edit`
2. Makes any edit (even unrelated changes like name or description)
3. Saves the product

The "Replace variants: delete old, insert new" comment in updateProduct (line 516) says this is intentional diffing logic, but the product form doesn't include variant data in its payload - it always sends an empty `variants: []` array.

**This is NOT a regeneration bug - it's an actual deletion bug.** The variants are gone from the database.

fix: The edit form must include variant data in its payload when saving. This requires:
1. Loading variants in the edit page server component
2. Including variants in the ProductFormInitial type
3. Passing variants through the form state to updateProduct

The simplest fix is to NOT delete variants when the form passes an empty array - only delete/re-insert when the admin explicitly manages variants.

fix_approach: Option 1 (preferred): Only delete/re-insert variants if variants array is not empty or explicitly set by admin action. Currently, updateProduct unconditionally deletes all variants before checking if variants.length > 0.

files_changed: []

