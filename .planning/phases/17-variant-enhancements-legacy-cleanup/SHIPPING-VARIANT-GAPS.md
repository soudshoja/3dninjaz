# Shipping × Variant Gap Analysis

**Date:** 2026-04-22  
**Scope:** 3D Ninjaz per-variant shipping data vs WooCommerce variable-product shipping model  
**Candidate addition to:** Phase 17 or new Phase 18  

---

## 1. Current State

3D Ninjaz computes shipping via `src/actions/shipping-quote.ts` `quoteForCart()` (lines 76–216). The function sums weight across cart items using `products.shippingWeightKg` (product-level, `schema.ts` line 165) — **no per-variant weight exists**. When `shippingWeightKg` is NULL on the product row, the function falls back to `shippingConfig.defaultWeightKg` (singleton table, default 0.5 kg, `schema.ts` line 1029). Dimensions (`shippingLengthCm`, `shippingWidthCm`, `shippingHeightCm`, `schema.ts` lines 166–168) are stored on the product row but are **not sent to Delyva** — the `quoteForCart` call passes only `weight` to `delyvaApi.quote()` with `dimension` absent (line 127–146 of `shipping-quote.ts`). There is no shipping class concept. The `shippingRates` table (`schema.ts` lines 791–799) is a legacy flat-rate-per-MY-state table from Phase 5; it is not used in the Delyva quote path. Result: every variant of a product ships at the same (possibly defaulted) product-level weight with no dimensional pricing input.

---

## 2. WooCommerce Model — Per-Variation Shipping Fields

- **Weight** — per-variation field; falls back to parent product weight if blank
- **Dimensions (L × W × H)** — per-variation; falls back to parent if blank
- **Shipping class** — per-variation override; maps to class-specific rates inside Shipping Zones
- **Free-shipping override** — implicit: virtual/downloadable variation removes all shipping fields
- **Bulk edit** — admins can set L/W/H/weight across all variations at once

---

## 3. Comparison Table

| Attribute | WooCommerce | 3D Ninjaz | Gap Severity |
|-----------|-------------|-----------|--------------|
| Weight per variant | Yes — variation-level override; parent fallback | No — product-level only (`products.shippingWeightKg`) | **CRITICAL** |
| Length per variant | Yes — variation override | No — product-level only (`products.shippingLengthCm`) | HIGH |
| Width per variant | Yes — variation override | No — product-level only (`products.shippingWidthCm`) | HIGH |
| Height per variant | Yes — variation override | No — product-level only (`products.shippingHeightCm`) | HIGH |
| Shipping class per variant | Yes — variation override; falls back to product class | Not present | MEDIUM |
| Free-shipping override | Virtual flag removes shipping | `freeShippingThreshold` in `shippingConfig` (order-level) | MEDIUM |
| Per-variant override vs product default | Yes — explicit blank = inherit | No — single product row, no override mechanism | CRITICAL |
| Delyva quote inputs (weight) | n/a | `products.shippingWeightKg` or `shippingConfig.defaultWeightKg` — variant-blind | CRITICAL |
| Delyva quote inputs (dimensions) | n/a | Stored on product row but **not sent to Delyva API at all** | HIGH |
| Admin UI for per-variant shipping edit | Inline in Variations tab + bulk actions | No UI for variant-level shipping; product-level dims in product form only | CRITICAL |

---

## 4. Specific 3D Ninjaz Concerns

**Dramatic weight variance by variant.** A "Small" keychain may weigh 10 g; a "Large" bust may weigh 500 g. At `defaultWeightKg = 0.5`, the Small is over-quoted 5× and the Large is under-quoted. Courier quote mismatch on the Large = profit leak or post-sale surcharge dispute.

**Parts-based products.** "Arm" vs "Robot Kit Full Set" on the same product — weight difference can be 5× or more. The current code (`shipping-quote.ts` line 108) uses `weights.get(it.productId) ?? fallbackWeight` — it reads only `products.shippingWeightKg`, completely ignoring which variant was selected. The variantId is never passed to `quoteForCart`; the `CartItemForQuote` type (line 37) has no `variantId` field.

**Delyva weight sent today when no per-variant weight exists.** If the parent `products.shippingWeightKg` is NULL, `fallbackWeight = Number(cfg.defaultWeightKg)` (default 0.5 kg) is used for every unit regardless of variant. For large 3D prints this results in systematically low courier quotes — the store absorbs the shortfall or overcharges customers.

**Dimensions completely unused.** Even at the product level, L/W/H are stored but the `quoteForCart` call passes no `dimension` to Delyva. Volumetric pricing (common for J&T, Pos Laju) is therefore never applied — quotes may be incorrect for large or awkward-shaped parcels.

---

## 5. Recommended Additions

**Schema** — add to `product_variants` in `src/lib/db/schema.ts`:

```sql
weight_g     INT          NULL   -- grams; overrides products.shippingWeightKg when set
length_cm    SMALLINT     NULL   -- override
width_cm     SMALLINT     NULL   -- override
height_cm    SMALLINT     NULL
```

Using integer grams (not decimal kg) avoids floating-point noise for 3D-print scale items.

**Checkout action** — `src/actions/shipping-quote.ts`:
- Extend `CartItemForQuote` to include `variantId`.
- In `quoteForCart`, fetch `product_variants.weight_g` for each `variantId`; use variant weight (converted to kg) if set, else fall back to `products.shippingWeightKg`, else `defaultWeightKg`.
- Wire dimensions into `delyvaApi.quote()` `dimension` field from variant (or product fallback).

**Admin UI** — `src/app/admin/products/[id]/variants/` variant editor:
- Add Weight (g), L/W/H (cm) inputs to each `VariantRow` (collapsible "Shipping" section per row).
- Add to `variantUpdateSchema` Zod in `src/actions/variants.ts`.

---

## 6. Scope Options

### Option A — Add to Phase 17 (minimum viable: weight_g only)
Add `weight_g INT NULL` to `product_variants` in plan `17-01-PLAN.md` (schema wave). Wire `quoteForCart` to read `variantId` and prefer `variant.weight_g` over product weight. Admin UI: single weight input per variant row in `17-02-PLAN.md`. No dimensions, no shipping class.  
**Effort:** +0.5 days to Phase 17. Low risk — one new nullable column and a small query change.

### Option B — New Phase 18 "Per-variant shipping attributes"
Full set: `weight_g` + `length_cm / width_cm / height_cm` + optional shipping class. Rewire `quoteForCart` to use variant dims in Delyva payload. Admin bulk-edit for shipping fields. Estimate 2–3 days.

### Option C — Defer entirely, keep flat-rate fallback
No change. Store absorbs quote mismatches.

### Recommendation: **Option A**

For a Malaysian store shipping small 3D-printed items via Delyva, weight is the primary courier pricing variable — J&T, Pos Laju, and GDEx all price on actual weight for sub-3 kg parcels. A 10 g keychain and a 500 g bust have the same product-level weight today (or the 0.5 kg default). This produces systematic misquotes on every order containing a large variant. Adding `weight_g` to Phase 17 is a 0.5-day schema + action change that closes the most expensive gap without blocking Phase 17's primary goals. Dimensions and shipping class can follow in Phase 18 once the courier pricing accuracy for weight alone is validated in production.

---

## 7. Threats Introduced

| Threat | Description | Mitigation |
|--------|-------------|------------|
| Weight spoofing at checkout | Client cart could supply a fake low `variantId` to get a cheaper quote | `quoteForCart` must always re-fetch variant weight server-side; never trust client-supplied weight values |
| Admin forgets to set weight | New variants default `weight_g = NULL`, fall back to product weight | Display a yellow warning badge in the variant editor when `weight_g` is NULL and `products.shippingWeightKg` is also NULL |
| Parts-product weight summing | "Robot Kit" = sum of parts; `weight_g` per variant must represent the shipped weight of that variant, not a component | Document convention in admin UI tooltip: "Enter the weight of what you ship for this variant" |
| Delyva API contract change | If Delyva changes the `weight` field structure, all quotes break silently | Existing `DelyvaError` surface in `src/lib/delyva.ts` catches API errors; add an integration smoke test |

---

## 8. Migration Plan Sketch (Option A)

**Tables touched:** `product_variants` only.

**DDL:**
```sql
ALTER TABLE product_variants ADD COLUMN weight_g INT NULL AFTER height_cm;
```

**Backfill:** No automated backfill — existing variants remain `weight_g = NULL` and continue to use the product-level fallback, which is the current behaviour. Zero regression.

**`quoteForCart` change:** extend `CartItemForQuote` type with `variantId?: string`; in the weight-resolution loop, if `variantId` is present, query `product_variants.weight_g` in bulk (one `inArray` query); convert grams to kg; fall back to product weight, then `defaultWeightKg`. Existing callers without `variantId` continue to work unchanged.

**Plan file to amend:** `17-01-PLAN.md` (schema wave) — add `weight_g` column to the migration SQL block. `17-02-PLAN.md` (admin editor) — add weight input to `VariantRow`. A single line in `17-PLAN.md` "Out of Scope" must be updated to remove "Weight / dimensions per variant overrides" from the exclusion list.
