---
phase: 19-wave-3
plans: [19-06, 19-07]
verified: 2026-04-26T10:20:00Z
status: gaps_found
score: 11/12 targets verified
commits_verified: [286ea66, 2db1c2a, a57e9a1]
gaps:
  - truth: "Configurable products show 'From MYR X' label (smallest tier price) on /shop grid"
    status: failed
    reason: "Double-prefix display bug: product-card.tsx renders `from ${priceLabel}` where priceLabel is already 'From RM 7.00', resulting in visible text 'from From RM 7.00'"
    artifacts:
      - path: "src/components/store/product-card.tsx"
        issue: "Line 147: `from ${priceLabel}` — the outer lowercase 'from' prefix is always applied; formatFromTier already returns 'From RM X.XX' so configurable cards render 'from From RM 7.00'"
    missing:
      - "Minimum-diff fix: change line 147 to `{allSoldOut ? 'Sold out' : product.productType === 'configurable' ? priceLabel : `from ${priceLabel}`}` to skip the outer prefix when the label already includes it"
      - "Alternatively: change formatFromTier to return 'RM 7.00' (without the From prefix) and rely on the outer template — but this requires changing format.test.ts too"
---

# Phase 19 Wave 3 Verification Report

**Plans Verified:** 19-06 (PDP for configurable products) + 19-07 (/shop listing)
**Verified:** 2026-04-26
**Status:** GAPS FOUND — 1 blocking display bug
**Score:** 11/12 targets pass

---

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PDP for configurable products renders hero + thumbstrip + form + price meter + Add-to-bag (disabled until valid) | VERIFIED | configurable-product-view.tsx (338 LOC): ConfigurableImageGallery, ConfiguratorForm, price meter, disabled button logic all present |
| 2 | First text input or colour pick auto-swaps hero from display image to live KeychainPreview | VERIFIED | handleTouch() sets touched+showPreview; passed to ConfiguratorForm.onTouch; confirmed at lines 172-177 |
| 3 | Customer can flip back to display image via thumbstrip click | VERIFIED | ConfigurableImageGallery onTogglePreview(false) on display thumb click (line 144); state wired from ConfigurableProductView.setShowPreview |
| 4 | Price meter reads tier via lookupTierPrice; outOfTable disables Add-to-bag with clear message | VERIFIED | lookupTierPrice imported and called (line 125); outOfTable/requiredFilled/canAdd all derived (lines 135-147); 13 matches total |
| 5 | Stocked-product PDP renders byte-identically to pre-plan | VERIFIED | git diff shows 0 deletions in product-detail.tsx; early return only on productType===configurable; D-14 protected files (variant-editor.tsx, variants.ts, cart-store.ts) show 0 diff lines across both commits |
| 6 | Customer-side bundle never imports admin-only colour fields (codes/family/previous_hex) | VERIFIED | grep finds 3 matches in configurable-product-data.ts, ALL in comments. Zero matches in src/components/store/. Server boundary enforced. |
| 7 | Configurable products appear in /shop grid alongside stocked products | VERIFIED | CatalogProduct widened; hydrateProducts returns productType/priceTiers/maxUnitCount; product-card renders configurable branch |
| 8 | Configurable products show 'From MYR X.XX' label (smallest tier price) | FAILED | Double-prefix bug: rendered text is "from From RM 7.00" (line 147 outer prefix + formatFromTier's "From" prefix) |
| 9 | Stocked products show their existing price-range label, byte-identical | VERIFIED | Stocked branch in product-card.tsx untouched; formatFromTier only called for configurable branch |
| 10 | Configurable products do not render SoldOutBadge (no stock concept) | VERIFIED | Line 129: `{product.productType !== "configurable" && allSoldOut ? <SoldOutBadge /> : null}` |
| 11 | Tile thumbnail = primary display image (existing pickThumbnail flow) | VERIFIED | pickThumbnail called unconditionally at line 55 (no change) |

**Truth score: 10/11 (1 failed)**

---

## Verification Target Results

### Target 1 — D-10 PDP Discriminator Branch (D-14 BLOCKING)

**Status: PASS**

Git diff of commit 286ea66 on `product-detail.tsx`:
- Additive lines: 8 (2 imports + 2 type fields + 1 destructure + 3-line early return)
- Deletions: 0 (confirmed — no output from deletion grep)
- Discriminator: `if (product.productType === "configurable" && configurableData)` — 1 match
- `ConfigurableProductView` appears ≥2 (import + JSX)
- D-14 protected files (cart-store.ts, variant-editor.tsx, variants.ts) show 0 diff lines in commit 286ea66

Evidence:
```
+import { ConfigurableProductView } from "@/components/store/configurable-product-view";
+import type { PublicConfigField } from "@/lib/configurable-product-data";
+    productType?: "stocked" | "configurable";
+  configurableData?: { fields: PublicConfigField[]; ... };
+  configurableData,
+  if (product.productType === "configurable" && configurableData) {
+    return <ConfigurableProductView product={{ ...product, pictures }} {...configurableData} ... />;
+  }
```

---

### Target 2 — D-17 /shop Listing for Configurable Products

**Status: FAIL (WARNING severity)**

**Passing elements:**
- `formatFromTier` exported from `src/lib/format.ts` (line 48): PASS
- `formatFromTier` imported and called in product-card.tsx: 2 matches (import + call): PASS
- `productType === "configurable"` discriminant in product-card.tsx: 1 exact `===` + 3 `!==` guards: PASS
- `SoldOutBadge` guarded: `product.productType !== "configurable" && allSoldOut` (line 129): PASS
- git diff product-card.tsx additive lines: 9 (≤ 10 spec): PASS
- 5 vitest tests pass: PASS

**Failing element:**
- Rendered price label for configurable products: `"from From RM 7.00"` (double prefix)

Root cause: The product-card template at line 147 always wraps `priceLabel` with lowercase `"from "`:
```tsx
{allSoldOut ? "Sold out" : `from ${priceLabel}`}
```
For stocked products this was intentional: `priceRangeMYR` returns `"RM 18.00"`, making the label `"from RM 18.00"`.
For configurable products, `formatFromTier` returns `"From RM 7.00"`, making the rendered label `"from From RM 7.00"`.

The `aria-label` (line 92: `${product.name} — ${priceLabel}`) is not affected — screen readers see `"Name — From RM 7.00"` which is correct.

Note: the format string uses `"RM"` throughout (not `"MYR"`), which differs from the plan spec `"From MYR 7.00"`. This is a consistent project-level convention (`formatMYR` uses `RM`) — not a defect, just a nomenclature difference from the plan spec.

**Minimum-diff fix (2 options):**

Option A (recommended — 1 line change in product-card.tsx):
```tsx
// Line 147 — change:
{allSoldOut ? "Sold out" : `from ${priceLabel}`}
// To:
{allSoldOut ? "Sold out" : product.productType === "configurable" ? priceLabel : `from ${priceLabel}`}
```

Option B (change formatFromTier to not include "From" prefix, relying on outer template, but requires updating 5 test assertions):
```ts
// formatFromTier returns just "RM 7.00" — the template adds "from "
// Breaks 5 test expectations; higher blast radius
```

---

### Target 3 — KeychainPreview Generic SVG Name Strip

**Status: PASS**

- File exists: 121 LOC (≥80 spec): PASS
- `viewBox`: 2 matches: PASS
- `baseHex` used as fill: `fill={isEmpty ? "none" : baseHex}` (line 85) — semantically uses baseHex for filled caps: PASS
- `letterHex` used as fill: `fill={letterHex}` (line 107): PASS
- `aria-label`: 1 match — `aria-label={text ? `Preview shows ${text}` : "Type your name to see preview"}` (line 55): PASS
- Stateless: no useState or side effects: PASS
- Empty-state fallback: when `text=""`, characters array is empty, all slots render as faint outlines: PASS
- Reactive: props are read directly in JSX without closure — updates synchronously on re-render: PASS

Note: Plan AC grep `fill={baseHex}\|fill={letterHex}` returns 1 match (only `letterHex` matches exactly; `baseHex` is inside a ternary). The semantic implementation is correct; the AC grep pattern was too strict for the conditional fill. Verified functionally.

---

### Target 4 — ConfigurableImageGallery Hero Swap

**Status: PASS**

- File exists: 185 LOC (≥120 spec): PASS
- `showPreview\|onTogglePreview`: 13 matches: PASS
- `"Yours"`: 5 matches (label text): PASS
- Default to display image: `showPreview` initialises as `false` (set in parent ConfigurableProductView); hero renders display image by default: PASS
- Hero swap on first interaction: parent's `handleTouch` sets `showPreview(true)` via `setShowPreview` which is passed as `onTogglePreview`: PASS
- Customer can flip back via thumb: display image thumbs call `onTogglePreview(false)` at line 144: PASS
- "Yours" thumbnail: small miniature of previewSlot rendered via scale(0.4) div (line 121): PASS
- All image types reachable via thumbstrip: "Yours" (live preview) + N display thumbnails: PASS
- Tap targets ≥44px: `minHeight: 44, minWidth: 44` on all buttons: PASS
- Mobile scroll: `overflow-x-auto` on thumbstrip: PASS

---

### Target 5 — ConfiguratorForm Validates Input

**Status: PASS**

- File exists: 386 LOC (≥150 spec): PASS
- 4 fieldType dispatches: `fieldType === "text"`, `"number"`, `"colour"`, `"select"` — 4 matches: PASS
- `onTouch`: 18 matches (prop declaration, invocation in each field sub-component): PASS
- `config.maxLength`: present in TextField (line 61): PASS
- `config.allowedChars`: present in TextField with regex filter (line 62): PASS
- `config.uppercase`: applied in handleChange (line 68): PASS
- `resolvedColours`: used in ColourField (line 165): PASS
- Number min/max/step enforced via `<input type="number" min/max/step>`: PASS
- Required red asterisk + "Required" microcopy: lines 325-332, 375-380: PASS
- Colour allowedColorIds subset: resolved via `field.resolvedColours` (pre-filtered by server, so only allowed colours shown): PASS
- Tap targets ≥44px: `minHeight: 48` on all inputs, 48px min swatch buttons: PASS

---

### Target 6 — Tier-Lookup Price Meter

**Status: PASS**

In `configurable-product-view.tsx`:
- `lookupTierPrice` imported and called: 3 matches (import, call in useMemo at line 125): PASS
- `outOfTable` derived (lines 135-140): PASS
- `requiredFilled` derived (lines 142-144): PASS
- `canAdd` derived (line 147): PASS
- Price meter renders "MYR X" via `formatMYR(currentPrice)` when price available: PASS
- `outOfTable` message: "Maximum {maxUnitCount} characters reached" in red (line 252): PASS
- "Enter your details" muted when `currentPrice === null` (line 257): PASS
- Add-to-bag disabled when `!canAdd` (line 278): PASS

---

### Target 7 — Storefront Read Action

**Status: PASS**

`src/lib/configurable-product-data.ts`:
- `import "server-only"` on line 1: 1 match: PASS
- `ensureConfigJson`: 4 matches: PASS
- `inArray(colors.id, uniqueIds)` single batch query: 1 match: PASS
- Admin-only fields grep (`previous_hex|previousHex|family_type|familyType|family_subtype|familySubtype|colors.code`): 3 matches, ALL in comments: PASS
- No `db.query.` LATERAL usage: 0 matches: PASS
- Manual multi-query hydration pattern: SELECT fields → parse configJson → batch colour query → product tier query → return: PASS
- Projection for colour resolvedColours: `{id: colors.id, name: colors.name, hex: colors.hex}` only — codes/previousHex/family* never selected: PASS

---

### Target 8 — Catalog Widening (Additive)

**Status: PASS**

`src/lib/catalog.ts`:
- `CatalogProduct` type: `Omit<ProductRow, "images" | "productType" | "priceTiers">` with explicit overrides: PASS
- Three new fields on type: `productType: "stocked" | "configurable"`, `priceTiers: Record<string,number> | null`, `maxUnitCount: number | null` (lines 67-69): PASS
- `ensureTiers` imported and called in `hydrateProducts` return: 2 matches (import + call): PASS
- Single hydration point (`hydrateProducts`) serves all catalog helpers (getActiveProducts, getActiveFeaturedProducts, getActiveProductBySlug, getActiveProductsByCategorySlug, getActiveProductsBySubcategorySlug): PASS
- No `db.query.products.findMany({ with: {} })` introduced: PASS
- Existing callers unaffected: `productType` field is new non-optional on CatalogProduct — TypeScript clean confirms all call sites compile: PASS

Note on plan AC: plan says `productType:` in catalog.ts ≥ 4 occurrences; actual count is 2 with colon (type def + hydrateProducts return). The shared-helper architecture satisfies the intent with fewer grep matches. TypeScript clean is the authoritative check.

---

### Target 9 — D-14 BLOCKING — Variant Code Path Untouched

**Status: PASS**

- `git diff 286ea66^..286ea66 -- src/lib/cart-store.ts src/components/admin/variant-editor.tsx src/lib/variants.ts`: 0 lines output: PASS
- `git diff 2db1c2a^..2db1c2a -- src/lib/cart-store.ts src/components/admin/variant-editor.tsx src/lib/variants.ts`: 0 lines output: PASS
- Neither Wave 3 commit touched any D-14 protected file: PASS

---

### Target 10 — Stocked Product Flow Unchanged

**Status: PASS**

Trace for `productType='stocked'` on `/products/[slug]`:
1. `getActiveProductBySlug` returns `productType: "stocked"` (default in hydrateProducts line 260)
2. Slug page: `configurableData` branch is skipped (`product.productType === "configurable"` is false)
3. `ProductDetail` receives `productType: "stocked"`, `configurableData: undefined`
4. Discriminator at line 57: `product.productType === "configurable" && configurableData` → false (both conditions fail)
5. Falls through to existing variant flow: `useState`, `VariantSelector`, `AddToBagButton` — all unchanged

Product-card stocked rendering:
- `allSoldOut`: computed using `product.productType !== "configurable"` guard — stocked products follow original logic: PASS
- `hasSale`: same guard: PASS
- `SoldOutBadge`: guarded with `product.productType !== "configurable" && allSoldOut`: PASS
- `priceLabel` stocked branch: `priceRangeMYR(availableVariants)` — untouched: PASS

---

### Target 11 — TS Clean + Build

**Status: PASS**

- `npx tsc --noEmit`: exits 0, no output: PASS
- `npx vitest run src/lib/format.test.ts`: 5/5 tests pass: PASS
- TypeScript clean across all 7 new/modified files: PASS

---

### Target 12 — REQ Coverage

**Status: PASS**

- Plan 19-06 frontmatter: `requirements: [REQ-7, REQ-9]`: PASS
- Plan 19-07 frontmatter: `requirements: [REQ-7]`: PASS
- REQ-7 ("Customers can browse and purchase made-to-order configurable products") covered by both plans (PDP + /shop listing): PASS
- REQ-9 (if applicable — tier pricing display) covered by 19-06 price meter: PASS

---

## Anti-Pattern Scan

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `configurable-product-view.tsx` line 188 | `console.info("[19-06] add stub")` | INFO | Documented stub (D-11) — Plan 19-08 wires cart. Expected, not a regression. |
| `product-card.tsx` line 147 | `from ${priceLabel}` double-prefix | WARNING | Produces "from From RM 7.00" for configurable products — see Target 2 gap. |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `configurable-product-view.tsx` | `priceTiers` (passed as prop) | `getConfigurableProductData()` → DB query on `products.priceTiers` + `ensureTiers` | Yes — DB read | FLOWING |
| `configurator-form.tsx` | `field.resolvedColours` (passed as prop) | `configurable-product-data.ts` → `inArray(colors.id)` batch query | Yes — DB read | FLOWING |
| `product-card.tsx` | `priceLabel` (configurable branch) | `CatalogProduct.priceTiers` → `ensureTiers(p.priceTiers)` in hydrateProducts | Yes — DB column | FLOWING but display bug (double prefix) |

---

## Behavioral Spot-Checks

| Behavior | Check | Status |
|----------|-------|--------|
| formatFromTier({1:7}) returns "From RM 7.00" | vitest: PASS | PASS |
| formatFromTier(null) returns "Coming soon" | vitest: PASS | PASS |
| formatFromTier({2:9,3:12}) uses smallest key | vitest: PASS | PASS |
| TypeScript compiler accepts all new types | tsc --noEmit: 0 exit | PASS |
| product-card renders configurable "from From RM 7.00" | code trace line 147 | FAIL — double prefix |

Server startup / UI smoke: skipped — requires running server (Step 7b constraint).

---

## Human Verification Required

### 1. PDP Full Interaction Flow (After Seed)

**Test:** After Plan 19-11 seed creates a keychain product, navigate to `/products/{keychain-slug}` and type "JACOB" in the name field.
**Expected:** Hero swaps to KeychainPreview showing J-A-C-O-B in 5 caps; price meter updates to MYR 18; Add-to-bag becomes active; clicking a display thumbnail flips back to display image.
**Why human:** Requires running dev server + seeded product.

### 2. /shop Grid Rendering (After Gap Fix)

**Test:** After fixing the double-prefix bug (Target 2 minimum-diff fix), load `/shop` with a configurable product in the database.
**Expected:** Card shows "From RM 7.00" (not "from From RM 7.00"). Stocked product cards unchanged.
**Why human:** Requires running dev server.

---

## Gaps Summary

**1 gap blocking full goal achievement:**

**Target 2 — Double-prefix price label on /shop grid (WARNING)**

The configurable product price label on `/shop` renders as `"from From RM 7.00"` due to the product-card template always prepending lowercase `"from "` before `priceLabel`, while `formatFromTier` already returns `"From RM X.XX"`.

Root cause: The plan's interface shows `formatFromTier` returning `"From MYR X"` and the card template was expected to use the label directly — but the existing stocked-product template uses `from ${priceLabel}` as a convention. The implementation wired both without reconciling the prefix.

The cart `aria-label` is unaffected (reads `priceLabel` directly). No functional/payment impact. The defect is purely visual on the shop grid.

**Minimum fix:** 1-line change to `product-card.tsx` line 147.

---

_Verified: 2026-04-26T10:20:00Z_
_Verifier: Claude (gsd-verifier)_
