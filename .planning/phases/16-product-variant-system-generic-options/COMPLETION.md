# Phase 16 — Product Variant System (Generic Options) — COMPLETION

**Completed:** 2026-04-22
**Plans:** 7/7
**Commits:** 7 (one per plan, atomic)

---

## Summary

Phase 16 replaces the rigid `productVariants.size` enum (S/M/L) with a fully generic
options/values/variants model. Admin can now define 1–3 options per product (e.g.,
"Size", "Color", "Part") with arbitrary value lists; the system auto-generates the
cartesian variant matrix. Parts-based products (each component as a separate variant
with its own price) are now first-class.

---

## What Shipped

### 16-01 — Schema + Migration (Wave 1)
- New tables: `product_options`, `product_option_values`
- New columns on `product_variants`: `option1_value_id`, `option2_value_id`, `option3_value_id`, `label_cache`, `sku`, `image_url`, `position`
- New column on `order_items`: `variant_label` (VARCHAR 255, nullable)
- Raw-SQL migration applicator: `scripts/phase16-migrate.cjs`

### 16-02 — Backfill + Dual-read Helpers (Wave 1)
- Backfill script `scripts/phase16-backfill.cjs`: creates "Size" option + S/M/L values for all existing products, populates `option1_value_id` on every legacy variant row
- `src/lib/variants.ts`: `hydrateProductVariants()`, `composeVariantLabel()`, `findVariantByOptions()`, `HydratedVariant` / `HydratedOption` types
- `src/lib/catalog.ts`: updated `getProduct()` / `getProducts()` to hydrate options + variants in 3 queries (no LATERAL)

### 16-03 — Admin Variant Editor (Wave 2)
- `/admin/products/[id]/variants` — option editor, matrix generator, per-variant inline editor
- `src/components/admin/variant-editor.tsx` — full CRUD for options + values + variants
- Server actions: `getVariantsAdmin`, `upsertOption`, `deleteOption`, `upsertOptionValue`, `deleteOptionValue`, `updateVariant`, `generateVariantMatrix`, `deleteVariant`

### 16-04 — Storefront PDP Variant Selector (Wave 2)
- `src/components/store/variant-selector.tsx` — N-option pill/swatch selector
- Product detail page updated to use `VariantSelector` when `options` are present; falls back to legacy `SizeSelector` for pre-16 products
- Color option auto-detects hex swatches from `swatchHex` field

### 16-05 — Cart v2 + Checkout + Orders Rewire (Wave 3)
- Cart store v2: stores only `variantId + quantity`; `hydrateCartItems()` server action resolves label, price, availability, image server-side
- `CartDrawer`, `BagPage`, `CheckoutSummary`, `PayPalButton`, `MobileSummarySheet`, `ShippingRatePicker` all migrated from `CartItem[]` to `HydratedCartItem[]`
- `paypal.ts` captures `variantLabel` per line item; `order_items.variant_label` populated at checkout
- Order history + invoice PDF + order confirmation email all show `variantLabel` with `size` fallback

### 16-06 — Inventory / Cost / CSV Adapted (Wave 3)
- `/admin/inventory` rebuilt: per-variant rows (label, SKU, stock, track_stock, in-stock)
- CSV import schema migrated: `option1_name`, `option1_values`, `option1_prices` (through option3); back-compat with legacy `price_s/m/l`
- CSV preview updated to show "Options" + "Variants" columns

### 16-07 — Legacy Cleanup + Parts Seed + Completion (Wave 4)
- `src/lib/db/schema.ts`: `productVariants.size` enum removed; `orderItems.size` changed to nullable (preserved for historical order rendering)
- `src/lib/variants.ts`: `legacyVariantToHydrated()` removed; zero-options fallback inlined
- All `v.size` reads purged from: `cart.ts`, `paypal.ts`, `catalog.ts`, `inventory/page.tsx`, `wishlist.ts`, `product-detail.tsx`, `products/[slug]/page.tsx`
- `scripts/phase16-cleanup.cjs`: idempotent `ALTER TABLE product_variants DROP COLUMN size` with safety checks
- `scripts/phase16-seed-parts.cjs`: "Ninja Robot Model Kit" seed — 5 part variants (Head RM25, Torso RM35, Left Arm RM20, Right Arm RM20, Legs RM30)

---

## Schema Changes

### New Tables
| Table | Purpose |
|-------|---------|
| `product_options` | One row per option (id, product_id, name, position) |
| `product_option_values` | One row per value (id, option_id, value, position, swatch_hex) |

### Modified Tables
| Table | Column | Change |
|-------|--------|--------|
| `product_variants` | `option1_value_id` | FK → product_option_values.id (nullable) |
| `product_variants` | `option2_value_id` | FK → product_option_values.id (nullable) |
| `product_variants` | `option3_value_id` | FK → product_option_values.id (nullable) |
| `product_variants` | `label_cache` | VARCHAR 500 nullable — precomputed label |
| `product_variants` | `sku` | VARCHAR 100 nullable |
| `product_variants` | `image_url` | VARCHAR 500 nullable |
| `product_variants` | `position` | INT NOT NULL DEFAULT 0 |
| `product_variants` | `size` | **DROPPED** (run `scripts/phase16-cleanup.cjs`) |
| `order_items` | `variant_label` | VARCHAR 255 nullable — snapshot at checkout |
| `order_items` | `size` | Changed from NOT NULL → nullable (historical preservation) |

---

## Migration Notes

### On the live database, run in order:
1. `node scripts/phase16-migrate.cjs` — adds new tables + columns (idempotent)
2. `node scripts/phase16-backfill.cjs` — migrates existing S/M/L variants to option model
3. Verify: `SELECT COUNT(*) FROM product_variants WHERE option1_value_id IS NULL` → must be 0
4. `node scripts/phase16-cleanup.cjs` — drops `product_variants.size` after verification
5. (Optional) `node scripts/phase16-seed-parts.cjs` — seeds demo product

### DO NOT run cleanup before backfill completes.

---

## Known Follow-ups

- The legacy `SizeSelector` component and `size-guide.tsx` still exist for pre-backfill fallback. Once all products are confirmed migrated, these can be removed.
- `product-form.tsx` (the old S/M/L edit form) now receives an empty `variants: []` — the variant section is vestigial; it can be removed from the edit page UI in a future cleanup phase.
- `order_items.size` column is preserved indefinitely for historical order rendering. No action needed.
- The `legacyShape` bridge in `product-detail.tsx` (line ~267) passes `size: "S"` placeholder to `AddToBagButton` — this is dead code after 16-05 cart upgrade and can be cleaned up.

---

## Success Criteria Verification

- [x] Admin can create a product with 1..3 options (generic option editor at `/admin/products/[id]/variants`)
- [x] System auto-generates cartesian variant matrix from options
- [x] Existing products migrated: legacy size variants backfilled to `option1_value_id` via `phase16-backfill.cjs`
- [x] Storefront PDP shows generic `VariantSelector` with pill/swatch rendering per option type
- [x] Cart, checkout, orders, order_items, inventory, cost breakdown, and PayPal line items all use `variant_id` + human label
- [x] Admin can create a parts-based product ("Ninja Robot Model Kit" seed: 5 variants with own prices)
- [x] `product_variants.size` column removed from TypeScript schema (DB ALTER deferred to manual `phase16-cleanup.cjs`)
- [x] `order_items.size` preserved as nullable for historical order rendering
- [x] TypeScript compiles clean (`npx tsc --noEmit` passes with zero errors)
