---
status: investigating
trigger: "variant deletion bug - any changes at https://app.3dninjaz.com/admin/products/5f52e087-6aa6-43a0-a4c8-56a98cdccb68/variants get deleted and need to regenerate"
created: 2026-05-03T12:00:00Z
updated: 2026-05-03T12:00:00Z
---

## Current Focus

hypothesis: "The product form is calling updateProduct with an empty variants array, which triggers the 'Replace variants: delete old, insert new' code path in src/actions/products.ts line 517"
test: "Check what data the admin form sends when saving - does it include the existing variants or an empty array?"
expecting: "If the form sends empty variants array, the DB delete happens and all variants are lost"
next_action: "Read the admin product edit form to see how variants are submitted"

## Symptoms

**Expected:** User should be able to add variants via manual edits or generate matrix, and changes should persist.

**Actual:** "any changes you make at https://app.3dninjaz.com/admin/products/5f52e087-6aa6-43a0-a4c8-56a98cdccb68/variants it get deleted and needs to regenerate"

**Errors:** None reported

**When started:** Unknown - reported by user during investigation

**Reproduction:** Admin navigates to product variants page, adds/edits variants, changes disappear

## Eliminated

- hypothesis: "generateVariantMatrix is deleting existing variants before regenerating"
  evidence: "generateVariantMatrix at line 392-548 in variants.ts explicitly fetches existingVariants and only inserts MISSING combos - it never deletes. It's an ADD-ONLY operation."
  timestamp: 2026-05-03T12:00:00Z

- hypothesis: "updateProduct is NOT the cause - variants are preserved on update"
  evidence: "UpdateProduct at line 517 in products.ts DOES delete all variants: 'await db.delete(productVariants).where(eq(productVariants.productId, id))'. If the form submits empty variants array, all are deleted."
  timestamp: 2026-05-03T12:00:00Z

- hypothesis: "UI refresh() after generateVariantMatrix is overwriting local state"
  evidence: "refresh() is Pattern B - server refetch. It correctly fetches fresh data from server, not overwriting local changes. This is intended behavior."
  timestamp: 2026-05-03T12:00:00Z

## Evidence

- Timestamp: 2026-05-03T12:00:00Z
  checked: "src/lib/variants.ts - generateVariantMatrix function"
  found: "Lines 392-548. Function fetches existingVariants, builds existingSet, then only inserts combos not in the set. Uses basePosition from max(existing positions) to append after existing rows."
  implication: "generateVariantMatrix is ADD-ONLY, not REPLACE. It never deletes existing variants."

- Timestamp: 2026-05-03T12:00:00Z
  checked: "src/actions/variants.ts - generateVariantMatrix implementation"
  found: "Lines 460-548: fetches existingVariants, builds existingSet, then only inserts combos not in the set."
  implication: "Confirmed: generateVariantMatrix is ADD-ONLY, not REPLACE."

- Timestamp: 2026-05-03T12:00:00Z
  checked: "src/actions/products.ts - updateProduct function"
  found: "Line 517: 'await db.delete(productVariants).where(eq(productVariants.productId, id))'. This deletes ALL variants on every product update, then inserts only if variants.length > 0."
  implication: "CRITICAL FINDING: If the admin form submits an empty variants array during an update, ALL variants get deleted."

- Timestamp: 2026-05-03T12:00:00Z
  checked: "src/app/(admin)/admin/products/[id]/variants/page.tsx"
  found: "Line 48: 'const { options, variants } = await hydrateProductVariants(id)'. Passes initialVariants to VariantEditor."
  implication: "Initial variants are fetched fresh from DB on page load."

- Timestamp: 2026-05-03T12:00:00Z
  checked: "src/components/admin/product-form.tsx - handleSubmit function"
  found: "Line 317-345: The payload sent to updateProduct includes 'variants: []' at line 332. The form state NEVER includes variants from the editor - they are managed separately on the /variants page."
  implication: "ROOT CAUSE CONFIRMED: The admin product edit form always submits an empty variants array, which causes updateProduct to delete all variants (products.ts line 517) and has nothing to re-insert."

## Eliminated (continued)

- hypothesis: "updateProduct variants handling is intentional (replace all)"
  evidence: "Products.ts lines 516-564: 'Replace variants: delete old, insert new. Simpler and correct than diffing.' The comment even says this is intentional. BUT the admin form never sends variants, so this always deletes."
  timestamp: 2026-05-03T12:00:00Z

## Resolution

root_cause: "In src/actions/products.ts line 517, the updateProduct function unconditionally deletes all variants: 'await db.delete(productVariants).where(eq(productVariants.productId, id))'. The admin product edit form (product-form.tsx) always submits 'variants: []' in the payload (line 332). The variants are managed separately on the /variants page and are never included in the product form's update. When updateProduct receives an empty variants array, it deletes all existing variants (line 517) and has nothing to re-insert (line 519-563 only runs if variants.length > 0). The admin workflow is: edit product form → save → all variants deleted. The variants only reappear when admin visits /variants page and clicks 'Generate / Refresh Variant Matrix' (which repopulates from option combinations)."

fix: "The fix requires changing the admin workflow: when editing a stocked product, the form should NOT send variants: [] and should NOT trigger the variant replacement logic. Instead, variant edits should use the specific variant server actions (updateVariant, bulkUpdateVariants, etc.) without touching the product row's variants field. Alternatively, the server action updateProduct should be modified to only replace variants when explicitly requested, not on every product update. Since variant management happens on a separate page (/variants), the product edit form should NOT attempt to manage variants at all - it should exclude variants from the update payload."

verification: "Confirmed by code review: product-form.tsx line 332 sends variants: [], and products.ts line 517 deletes all variants unconditionally."

files_changed: []
