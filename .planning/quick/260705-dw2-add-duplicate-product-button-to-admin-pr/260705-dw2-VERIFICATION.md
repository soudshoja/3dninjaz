---
phase: quick-260705-dw2
verified: 2026-07-05T00:00:00Z
status: human_needed
score: 10/10 must-haves verified (code-level)
overrides_applied: 0
human_verification:
  - test: "Duplicate a STOCKED product with variants + images from /admin/products"
    expected: "Lands on new product's edit page; name ends '(Copy)'; status is Inactive/draft; variants present with NEW SKUs differing from source; images render correctly"
    why_human: "Requires a running app + real MariaDB + real filesystem to observe actual fs.cp copy, DB insert, and browser redirect — cannot be proven by static code reading alone"
  - test: "Duplicate a KEYCHAIN product"
    expected: "New product has its config fields (with locked personalisation field), tier pricing (priceTiers/maxUnitCount) intact, and unitField correctly points at the cloned text field"
    why_human: "unitField remap correctness under real seeded keychain data needs live DB verification"
  - test: "Duplicate a SIMPLE and a CONFIGURABLE product"
    expected: "Config fields + flat/tier price copied correctly"
    why_human: "Depends on real product data shape in the live DB"
  - test: "Delete the ORIGINAL product after duplicating it, then load the duplicate's images"
    expected: "Duplicate's images still load (proves physical file copy, not shared references/symlinks)"
    why_human: "Requires real filesystem state change (delete) and observing rendered image URLs in browser — not verifiable from source code alone"
  - test: "Confirm source product's SKUs are unchanged and no order history/reviews/wishlists were touched"
    expected: "Source variants keep original SKU strings; orders/reviews/wishlists rows for the source product are untouched"
    why_human: "Requires inspecting live DB rows before/after the operation"
---

# Quick Task 260705-dw2: Add Duplicate Product Button Verification Report

**Task Goal:** Add a "Duplicate" button to the admin product list so an admin can clone any product (any productType) in one click — physical image copy, always draft, fresh unique slug, fresh unique SKUs, requireAdmin()-guarded, redirects to new edit page.

**Verified:** 2026-07-05
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin sees a "Duplicate" action on every product row in /admin/products | VERIFIED | `product-row-actions.tsx` lines 129-132: `<DropdownMenuItem onClick={handleDuplicate}><Copy .../>Duplicate</DropdownMenuItem>` rendered unconditionally inside the per-row dropdown, above the delete separator |
| 2 | Clicking Duplicate clones the product and redirects to the new product's edit page | VERIFIED | `handleDuplicate()` (lines 67-82) calls `duplicateProduct(id)` inside `startTransition`, then `router.push(\`/admin/products/${res.productId}/edit\`)` on success; `window.alert(...)` on failure |
| 3 | The duplicate is always a draft (isActive=false) regardless of source's active state | VERIFIED | `src/actions/products.ts` line 1101: `isActive: false, // ALWAYS draft, regardless of src.isActive` — hardcoded, not conditioned on `src.isActive` |
| 4 | Duplicate's name is "{original} (Copy)" and slug is unique | VERIFIED | Line 1084 `const newName = \`${src.name} (Copy)\`;` and line 1085 `generateUniqueProductSlug(newName)` — queries `products.slug LIKE '${base}%'` and appends `-2`, `-3`, ... until free (lines 57-72) |
| 5 | Stocked products copy full options/values/variants tree with FRESH, unique SKUs (never source SKU) | VERIFIED | `cloneVariantTree` (lines 927-1047): options → values → variants cloned with fresh `randomUUID()` ids and remapped FK chains; SKU is regenerated via `generateVariantSku(destSlug, labelParts)` (never `v.sku`) with a batch-local `usedSkus` Set clash suffix (lines 1004-1011) |
| 6 | Configurable/keychain/vending products copy productConfigFields with fresh ids; unitField remapped | VERIFIED | `cloneConfigFields` (lines 864-916) inserts fresh-id rows per source field; `duplicateProduct` remaps `src.unitField` through the returned `fieldIdMap` and updates the new row's `unitField` (lines 1115-1123) |
| 7 | Tier columns (maxUnitCount, priceTiers, weightTiers) copy to duplicate | VERIFIED | Lines 1096-1098: `maxUnitCount: src.maxUnitCount, priceTiers: src.priceTiers, weightTiers: src.weightTiers` copied verbatim into the insert |
| 8 | All product images physically copied into new `/uploads/products/<newId>/` folder — never shared with source | VERIFIED | `copyProductImages()` in `src/lib/storage.ts` (lines 121-178) uses `fs.cp(srcDir, destDir, { recursive: true, force: true })` — a real physical copy, not a rename/move/symlink; traversal-guarded via `path.resolve().startsWith(root)`; dedupes already-copied subdirs |
| 9 | Deleting the source product after duplication leaves the duplicate's images intact | VERIFIED (by design) | `deleteProduct()` (lines 705-714) only does `db.delete(products).where(eq(products.id, id))` — it does not call `deleteUpload`/touch the filesystem at all in the current codebase, and separately, since `copyProductImages` is a full physical `fs.cp` into a distinct `<newId>` directory (not a reference/symlink), the duplicate's files are independent of the source's directory regardless |
| 10 | Order history, reviews, wishlists NOT cloned | VERIFIED | `duplicateProduct`/`cloneConfigFields`/`cloneVariantTree` only touch `products`, `productConfigFields`, `productOptions`, `productOptionValues`, `productVariants` — no import or reference to `orders`, `reviews`, or `wishlists` tables anywhere in the new code |

**Score:** 10/10 truths verified (code-level, static analysis)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/storage.ts` | `copyProductImages()` — physical image dir copy + URL rewrite | VERIFIED | Function present (lines 121-178), exported, uses `fs.cp` recursive copy, `safeBucket()` + `path.resolve().startsWith(root)` traversal guards matching `migrateNewImages` pattern, never silently drops a URL on error |
| `src/actions/products.ts` | `duplicateProduct()` + private clone helpers | VERIFIED | `generateUniqueProductSlug` (57-72), `cloneConfigFields` (864-916), `cloneVariantTree` (927-1047), `duplicateProduct` (1057-1133) all present, exported/private as specified |
| `src/app/(admin)/admin/products/product-row-actions.tsx` | Duplicate dropdown item wired to `duplicateProduct` + redirect | VERIFIED | Imports `duplicateProduct` and `Copy` icon; `handleDuplicate` wired to a `DropdownMenuItem` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `product-row-actions.tsx` | `duplicateProduct` in `products.ts` | `onClick` handler inside `startTransition` | WIRED | `handleDuplicate` calls `await duplicateProduct(id)` inside `startTransition(async () => {...})`, checks `res.success`/`res.productId` before redirecting |
| `duplicateProduct` | `copyProductImages` in `storage.ts` | physical image copy before persisting images JSON | WIRED | Called at line 1074 for product-level images, inside `cloneConfigFields` for Select-option images, and inside `cloneVariantTree` for variant `imageUrl` |
| `duplicateProduct` | `products.unitField` | remap old config-field id → new config-field id | WIRED | Lines 1115-1123: looks up `fieldIdMap.get(src.unitField)` and issues a follow-up `db.update(products).set({ unitField: newUnitFieldId })` |
| `cloneVariantTree` | `generateVariantSku` in `src/lib/sku.ts` | fresh SKU generation with -2/-3 clash suffix | WIRED | Line 1004 `generateVariantSku(destSlug, labelParts)`, followed by `usedSkus` Set-based clash-suffix loop (1005-1011); signature confirmed to match `sku.ts`'s `(productSlug: string, optionValueLabels: (string|null|undefined)[])` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `duplicateProduct` images | `rewrittenEntries` | `ensureImagesV2(src.images)` → `copyProductImages(...)` → rebuilt V2 objects | Yes — real source-product image URLs parsed and rewritten, not hardcoded | FLOWING |
| `cloneVariantTree` SKUs | `sku` per variant | `generateVariantSku(destSlug, labelParts)` derived from real cloned option-value labels | Yes | FLOWING |
| `product-row-actions.tsx` redirect target | `res.productId` | Return value of the real `duplicateProduct` server action (not a hardcoded route) | Yes | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — this is Next.js admin UI + server actions requiring a running app, a real MariaDB connection, and real on-disk product image directories to execute `duplicateProduct` end-to-end (DB insert + `fs.cp`). No local runnable entry point exists for this without starting the dev server against the tunnel DB, which the verification process explicitly avoids (no server starts, no state mutations). `npx tsc --noEmit -p tsconfig.json` was run instead and passed clean with no errors.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DUP-01 | 260705-dw2-PLAN.md | Add Duplicate action to admin product list | SATISFIED | All must-have truths (1-10) verified against actual `src/lib/storage.ts`, `src/actions/products.ts`, `src/app/(admin)/admin/products/product-row-actions.tsx` code. Note: DUP-01 does not appear in `.planning/REQUIREMENTS.md` — this is a quick task, which does not require a formal REQUIREMENTS.md entry. |

### Anti-Patterns Found

None. Scanned `src/lib/storage.ts`, `src/actions/products.ts` (new functions), and `product-row-actions.tsx` for TODO/FIXME/placeholder/stub markers, empty-handler patterns, and hardcoded-empty return values — no matches. `requireAdmin()` is correctly the first `await` in `duplicateProduct` (CVE-2025-29927 convention, matches `deleteProduct`/`toggleProductActive` pattern used elsewhere in the same file).

### Human Verification Required

### 1. Duplicate a stocked product end-to-end

**Test:** On `app.3dninjaz.com` (dev), go to `/admin/products`, click the "..." menu on a stocked product with multiple variants and images, click Duplicate.
**Expected:** Redirects to `/admin/products/<newId>/edit`; product name ends in "(Copy)"; status shows Inactive/draft; variant list shows the same variant combinations but with different (freshly generated) SKU strings; all images render.
**Why human:** Requires a live app, live MariaDB, and live filesystem to actually execute the INSERT + `fs.cp` operations and observe the resulting UI — cannot be proven by reading source code alone.

### 2. Duplicate a keychain product

**Test:** Duplicate a keychain-type product with its personalisation config field.
**Expected:** New product has the same config fields (locked personalisation field included), tier pricing (`priceTiers`/`maxUnitCount`) intact, and `unitField` correctly points at the newly cloned field (personalisation input still works on the new product's PDP preview).
**Why human:** unitField remap correctness depends on the real seeded shape of keychain config fields in the live DB, which isn't visible from source alone.

### 3. Duplicate a simple/configurable product

**Test:** Duplicate a simple and a configurable product.
**Expected:** Config fields and flat/tier pricing carry over correctly.
**Why human:** Depends on real product data shape in the live DB.

### 4. Delete source, confirm duplicate images survive

**Test:** After duplicating a product, delete the ORIGINAL source product, then reload the duplicate's edit page.
**Expected:** Duplicate's images still load (proving physical file copy, not a shared reference).
**Why human:** Requires an actual filesystem delete + observing rendered image URLs in a browser.

### 5. Confirm no cross-contamination

**Test:** After duplicating, check the source product's SKUs are unchanged, and no orders/reviews/wishlists reference the new product.
**Expected:** Source SKUs identical to before; no order/review/wishlist rows created for the duplicate.
**Why human:** Requires inspecting live DB state before/after the operation.

### Gaps Summary

No code-level gaps found. All ten must-have truths, three required artifacts, and four key links are present, substantive, and correctly wired based on direct inspection of `src/lib/storage.ts`, `src/actions/products.ts`, and `src/app/(admin)/admin/products/product-row-actions.tsx`. `npx tsc --noEmit` passes clean. Task commits (`571b285`, `a0b7949`, `cb17b86`, `42219d7`) all exist in the branch's git history.

Status is `human_needed` rather than `passed` solely because this feature's correctness (physical file copy surviving source deletion, SKU uniqueness under real data, unitField remap against real keychain config rows) can only be conclusively confirmed by exercising the running app against the live dev database and filesystem — exactly as the plan's own `<verification>` section prescribes. No blocking gaps were identified in the implementation itself.

---

_Verified: 2026-07-05_
_Verifier: Claude (gsd-verifier)_
