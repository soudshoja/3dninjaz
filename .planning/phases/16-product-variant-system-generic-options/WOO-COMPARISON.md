# Phase 16 Variant System — WooCommerce Gap Analysis

**Date:** 2026-04-22  
**Scope:** 3D Ninjaz Phase 16 admin variant editor vs WooCommerce Variable Products  
**Purpose:** Identify gaps that affect admin productivity and customer purchase flow

---

## Comparison Table

| # | Feature / Capability | WooCommerce | 3D Ninjaz (Phase 16) | Gap |
|---|---------------------|-------------|----------------------|-----|
| 1 | **Attribute scope** | Global (cross-product, Products > Attributes) AND per-product custom | Per-product only — no shared global attribute library | NICE-TO-HAVE |
| 2 | **Attribute types** | Select (dropdown) native; Color/Image/Button swatches via plugins (WooCommerce Variation Swatches etc.) | Select text + optional `swatchHex` hex color per value (in DB, not yet surfaced in admin UI picker) | NICE-TO-HAVE |
| 3 | **Max options per product** | No documented hard limit (commonly 3–5 in practice) | Hard cap of 3 (enforced in DB unique constraint + server action) | NICE-TO-HAVE |
| 4 | **Max option values** | No hard limit | No hard limit (no code-level cap found) | PARITY |
| 5 | **Variant generation — auto cartesian** | "Generate variations" button creates full cartesian product | "Generate / Refresh Variant Matrix" button — identical cartesian logic | PARITY |
| 6 | **Variant generation — manual (selective)** | "Add manually" allows picking only specific combos | Not supported — matrix always generates all combos; individual rows can be deleted post-generation | NICE-TO-HAVE |
| 7 | **SKU per variant** | Yes — text field, globally unique enforced | Yes — text field, unique scoped to product (per AD-06) | PARITY |
| 8 | **GTIN / UPC / EAN / ISBN per variant** | Yes (built-in from WC 8.x+) | Not present | NICE-TO-HAVE |
| 9 | **Regular price per variant** | Yes — required field | Yes — required (decimal, MYR) | PARITY |
| 10 | **Sale price per variant** | Yes — optional lower price | Not present — single `price` field only | CRITICAL |
| 11 | **Sale scheduling (from/to dates)** | Yes — set sale start and end dates per variant | Not present | NICE-TO-HAVE |
| 12 | **Cost of goods per variant** | Via WooCommerce Cost of Goods plugin (not core) | Yes — native (Phase 14): `costPrice`, `filamentGrams`, `printTimeHours`, `laborMinutes`, `otherCost` + live margin readout | MISSING-IN-WOO (core) |
| 13 | **Stock quantity per variant** | Yes — `stock_quantity` field | Yes — `stock` INT column | PARITY |
| 14 | **Track stock toggle per variant** | Yes — "Manage stock?" checkbox | Yes — `trackStock` boolean with Switch in UI | PARITY |
| 15 | **Stock status override (in/out)** | Yes — "In stock / Out of stock / On backorder" enum | Yes — `inStock` boolean toggle in variant row | PARITY (partial — we lack "On backorder" state) |
| 16 | **Backorders per variant** | Yes — Allow / Do not allow / Notify me | Not present — `inStock` boolean only | NICE-TO-HAVE |
| 17 | **Low stock threshold per variant** | Yes — `low_stock_amount` | Yes — `lowStockThreshold` INT column (Phase 5), but not editable in variant editor UI | NICE-TO-HAVE |
| 18 | **Weight per variant** | Yes — overrides product-level weight | Not present at variant level — weight lives on parent product only | NICE-TO-HAVE |
| 19 | **Dimensions (L/W/H) per variant** | Yes — length, width, height override | Not present at variant level | NICE-TO-HAVE |
| 20 | **Shipping class per variant** | Yes — override parent shipping class | Not present | NICE-TO-HAVE |
| 21 | **Tax class per variant** | Yes — override parent tax class | Not present | NICE-TO-HAVE |
| 22 | **Variant image** | Yes — single image per variant; swaps on storefront selection | Schema column `imageUrl` exists; not yet editable in variant editor table (column missing from VariantRow) | CRITICAL |
| 23 | **Variant image gallery** | Not in core WC (single image per variant) | Single image planned; not yet wired | PARITY (with WC core) |
| 24 | **Variant description** | Yes — per-variant custom description rendered on PDP | Not present — no `description` field on variant row or schema | NICE-TO-HAVE |
| 25 | **Downloadable / virtual flags** | Yes — per variant (enables file delivery) | Not present (not relevant for physical 3D prints) | MISSING-IN-WOO concern (not applicable) |
| 26 | **Default variation** | Yes — pre-selects a variant combo on PDP load | Not present — storefront PDP loads with no pre-selection | NICE-TO-HAVE |
| 27 | **Storefront selector type** | Dropdowns (core); swatches via plugin | Text buttons/dropdowns (depends on PDP implementation in Wave 16-04) | NICE-TO-HAVE |
| 28 | **Out-of-stock graying on storefront** | Yes — unavailable combos hidden from dropdowns (with conditions) | Not confirmed — requires Wave 16-04 PDP implementation to check; schema supports it via `inStock` | NICE-TO-HAVE |
| 29 | **Image swap on variant selection** | Yes — variant image replaces product gallery image on selection | Not confirmed wired in PDP; `imageUrl` field exists on schema | CRITICAL |
| 30 | **Bulk edit — set all prices** | Yes — bulk action sets regular/sale price across all variants at once | Not present — each variant row edited individually | CRITICAL |
| 31 | **Bulk edit — increase/decrease price by %** | Yes — bulk percentage change | Not present | NICE-TO-HAVE |
| 32 | **Bulk edit — set stock for all variants** | Yes — bulk stock update | Not present | NICE-TO-HAVE |
| 33 | **Bulk edit — set shipping for all variants** | Yes | Not present | NICE-TO-HAVE |
| 34 | **Bulk regenerate variants** | Yes — "Generate variations" is re-runnable (idempotent) | Yes — "Generate / Refresh Variant Matrix" is idempotent (skips existing) | PARITY |
| 35 | **Bulk delete variants** | Yes — "Delete all variations" action | Single variant delete only via Trash icon per row | NICE-TO-HAVE |
| 36 | **Enable/disable variant** | Yes — per-variant "Enabled" checkbox | Yes — `inStock` toggle acts as availability switch; no separate "enabled" field (conflated with stock status) | NICE-TO-HAVE (conflation is a UX issue) |
| 37 | **Variant position / sort order** | Drag-and-drop reorder within the variation list | `position` column exists in DB; no drag UI in editor | NICE-TO-HAVE |
| 38 | **Attribute / option reordering** | Drag-and-drop in Products > Attributes for global; manual in per-product | `position` column on `product_options`; no drag UI exposed in editor | NICE-TO-HAVE |
| 39 | **Option value reordering** | Drag-and-drop (affects dropdown sort order and storefront display) | `position` column on `product_option_values`; `reorderOptionValues` server action exists but no drag UI | NICE-TO-HAVE |
| 40 | **Import variants via CSV** | Yes — WooCommerce Products CSV importer supports variation columns | Explicitly deferred to Phase 16.1 (out of scope in 16-PLAN.md) | NICE-TO-HAVE |
| 41 | **Export variants via CSV** | Yes — built-in CSV exporter | Not present | NICE-TO-HAVE |
| 42 | **REST API — list/create/update variants** | Yes — `/wp-json/wc/v3/products/{id}/variations` endpoints | No public API (admin actions only, not REST-exposed) | NICE-TO-HAVE |
| 43 | **GraphQL API for variants** | Via WooGraphQL plugin (not core) | Not present | NICE-TO-HAVE |
| 44 | **Webhooks on variant changes** | Yes — `product.updated` webhook fires on variation save | Not present | NICE-TO-HAVE |
| 45 | **Admin UI reactivity (no reload)** | WC admin uses React blocks; near-instant updates | Known bug: after mutation, `router.refresh()` triggers a full server round-trip; optimistic update only for price/stock/sku fields; options/values require await+refresh | NICE-TO-HAVE (being fixed) |
| 46 | **Production cost breakdown** | Not in WC core | Yes — filament grams, print hours, labor minutes, overhead; live margin readout in admin | MISSING-IN-WOO |
| 47 | **Label cache / denormalized label** | Not explicit — WC derives label on-the-fly from attribute terms | Yes — `label_cache` column ("Small / Red") for fast renders without re-join | MISSING-IN-WOO (minor perf feature) |
| 48 | **Option uniqueness enforcement** | Not strictly enforced at DB level — admin UI prevents duplicates | DB-level UNIQUE constraint on `(product_id, name)` for options and `(option_id, value)` for values | MISSING-IN-WOO |
| 49 | **Variant image — admin upload** | Upload directly in variation panel | `imageUrl` stored as text URL; no upload widget wired in the variant editor row | CRITICAL |
| 50 | **Variant price: sale vs regular distinction** | Two separate fields — regular and sale (strikethrough display) | Single `price` field — no sale/compare-at price | CRITICAL |

---

## Top 5 Gaps (Ranked by Business Impact for 3D Ninjaz)

### 1. Sale Price / Compare-At Price per Variant (CRITICAL)
**Why it matters:** 3D Ninjaz targets kids 9–17 in Malaysia with a small catalog. Promotional pricing ("was MYR 35, now MYR 25") is a primary conversion lever for impulse purchases in this demographic. Without a separate sale price field, the admin cannot run discounts at variant level — they must reprice the single `price` field and lose the original as a reference. There is no strikethrough UX. With a small catalog and PayPal-only checkout, every point of perceived value counts.  
**Affected files:** `schema.ts` (missing `salePrice` column), `variants.ts`, `variant-editor.tsx` (VariantRow missing second price input), storefront PDP.

### 2. Variant Image — Upload and Swap on PDP (CRITICAL)
**Why it matters:** 3D prints differ visually by color/material. If a customer selects "Red" and the product image stays on the default "Blue" photo, they lose confidence in what they are buying. The schema has `imageUrl` as a text column but the admin editor has no upload widget, and the PDP swap is unconfirmed. This directly impacts add-to-cart conversion.  
**Affected files:** `variant-editor.tsx` (VariantRow has no image input), PDP storefront component (Wave 16-04 output).

### 3. Bulk Price Edit across All Variants (CRITICAL)
**Why it matters:** 3D Ninjaz admin is a single person managing a small catalog. When filament costs change or a storewide promotion runs, editing 6–24 variant prices one by one is an admin time sink that will cause pricing errors. WooCommerce solves this with a single "Set regular price" bulk action. Without it, the admin will avoid creating multi-variant products, reducing the catalog depth that differentiates the store.  
**Affected files:** `variant-editor.tsx` (no bulk action bar), `variants.ts` (no bulk update action).

### 4. Out-of-Stock Graying / Combo Disabling on Storefront (CRITICAL)
**Why it matters:** If a customer selects "Large / Red" and that variant is out of stock but the UI does not communicate this until after they click Add to Bag, cart abandonment spikes. For a Malaysian market with low trust in new small stores, a bad checkout experience is hard to recover from. The schema supports `inStock` per variant; the storefront PDP must disable or visually gray unavailable combos.  
**Affected files:** PDP variant selector (Wave 16-04); requires confirmed wiring from `inStock` → UI disabled state.

### 5. Default Variation Pre-Selection on PDP (NICE-TO-HAVE, high business impact)
**Why it matters:** For a single-option product (e.g., Size only), landing on the PDP with nothing pre-selected forces an extra click before Add to Bag. With a small catalog and mobile-first Malaysian shoppers, reducing tap count matters. WooCommerce ships this as a built-in field. Implementation is straightforward: add a `isDefault` boolean to `product_variants` and read it on PDP load.  
**Affected files:** `schema.ts` (add `isDefault`), `variant-editor.tsx` (radio/checkbox per row), PDP selector component.

---

## Recommended Phase 17 Scope

Keep to 2–3 items. Prioritize purchase-blocking gaps over admin-convenience gaps.

### P17-A — Sale Price + Compare-At Display
Add `salePrice DECIMAL(10,2) NULL` to `product_variants`. Extend `variantUpdateSchema` Zod. Add second price input to `VariantRow`. Update PDP to show strikethrough regular price when `salePrice` is set. Extend cart hydration to use `salePrice ?? price` as the checkout price.  
**Estimated effort:** 1 day. High ROI.

### P17-B — Variant Image Upload + PDP Image Swap
Wire an image upload widget into `VariantRow` (reuse existing product image upload pattern from `public/uploads/`). On PDP, when a variant with `imageUrl` is selected, swap the hero/gallery image to that URL. Fall back to product-level images when `imageUrl` is null.  
**Estimated effort:** 1–2 days. Directly impacts conversion.

### P17-C — Bulk Price Edit Action Bar
Add a sticky action bar above the variant matrix table with: "Set all prices to MYR ___" and "Toggle all active/inactive". Server action `bulkUpdateVariants(productId, patch)`. Keep scope narrow — price and active only.  
**Estimated effort:** 0.5 days. High admin UX return for low effort.

**Defer to later phases:** CSV import/export, REST API, per-variant weight/dimensions, global attributes, drag reorder.
