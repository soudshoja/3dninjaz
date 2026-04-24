# Phase 16 — Product Variant System (Generic Options)

**Status:** Not planned
**Added:** 2026-04-24
**Milestone:** v1.0 (post-launch extension)

## Goal

Replace the rigid `productVariants.size` enum (hardcoded `S/M/L`) with a generic options/values/variants model. Admin defines 1..3 options per product (e.g., `Size`, `Color`, `Part`, `Material`) with arbitrary value lists. Variants are cartesian combinations with per-variant price, stock, SKU, image.

One system supports both current needs:
- **Type A — size + color products:** `options = [Size, Color]`, variants = cartesian combos
- **Type B — parts-based products:** `options = [Part]` (optionally `+ Color`), each part a separate variant with own price/stock/image

## Current State (what exists today)

### Schema — `src/lib/db/schema.ts`

- `products` table (no variant options concept)
- `productVariants` table with:
  - `size: mysqlEnum(["S","M","L"])` — **rigid, blocks new attribute types**
  - `price decimal`
  - `inStock boolean` (Phase 5)
  - `lowStockThreshold int` (Phase 5)
  - `costPrice decimal` (Phase 10, nullable)
  - `trackStock boolean` (Phase 13)
  - Cost breakdown columns (Phase 14)

- `orderItems.size` — also `mysqlEnum(["S","M","L"])` enum, references the size

### Code paths that read `.size`

- `src/actions/products.ts` — `getProduct`, `getProducts` (manual hydration pattern per MariaDB no-LATERAL rule)
- `src/lib/catalog.ts` — storefront catalog
- `src/lib/cart-store.ts` — cart item shape includes `size`
- `src/app/(store)/product/[slug]/` — PDP size selector
- `src/app/bag/`, `/checkout/`, `/orders/[id]/` — render size label
- `src/lib/paypal.ts` — PayPal line items include size
- `src/actions/orders.ts` — order creation persists size to `orderItems`
- Admin product form — per-size price inputs (3 fixed rows)
- Inventory, cost, invoice PDFs — all reference size

## Why Now

- Customer shipped (`app.3dninjaz.com` live 2026-04-21) with fixed size/color assumption
- New product category: **parts-based products** (e.g., a figurine sold part-by-part — "Left Arm", "Head", "Right Leg"). Each part has own price + stock + image. Cannot be modeled with `size` enum.
- Future-proofs for additional attributes (Material: PLA/Resin/PETG; Finish: Matte/Glossy) without schema change per attribute

## Target Model (proposed during planning)

```
product_options           (id, product_id, name, position)
  e.g. (uuid, prodA, "Size", 1), (uuid, prodA, "Color", 2)

product_option_values     (id, option_id, value, position)
  e.g. (uuid, sizeOptId, "Small", 1), (uuid, sizeOptId, "Medium", 2)

product_variants          (id, product_id, sku, price, stock, image_id,
                           option1_value_id, option2_value_id, option3_value_id)
  one row per buyable combination
```

Option values normalized (not free-text in variant rows) so rename propagates.
`option1/2/3` positional pattern = Shopify's proven model. Keeps variant row narrow + queryable without a join table for every lookup.

## Migration Strategy (rough)

1. Add new tables (options, option_values) — don't touch `product_variants` yet
2. Backfill: for each existing product, create one `product_options` row (name="Size", position=1) + three `product_option_values` rows (S, M, L) + update each `product_variants` row to set `option1_value_id` pointing to the right value row
3. Drop `product_variants.size` column AFTER code is ported to read option values
4. Same treatment for `order_items.size` — freeze as-is (historical data), new orders write a denormalized `variant_label` field

## Downstream Impact

| Area | Change |
|------|--------|
| Admin product form | Completely rebuild: option editor + variant matrix editor |
| Storefront PDP | Variant selector must handle N options, not just size |
| Cart (Zustand) | Line item stores `variantId` instead of `(productId, size)` |
| Checkout | Price + stock lookup by `variantId` |
| Orders schema | `order_items.variant_id` (FK) + `variant_label` snapshot (text) |
| PayPal line items | Label = variant's human-readable combo ("Small / Red" or "Left Arm") |
| Inventory page | Show all variants, not just S/M/L rows |
| Cost breakdown | Per-variant, not per-size |
| Invoice PDF | Render `variant_label` |
| CSV import | New header schema for arbitrary options/variants |

Estimated scope: 7-10 plans. Non-trivial schema + wide code touch surface. Budget 4-6 days focused.

## Open Questions (for discuss-phase)

1. Max options per product — fix at 3 (Shopify default) or make dynamic?
2. Migration downtime posture — blue/green deploy or accept short window?
3. What about `order_items.size` for existing orders — freeze column forever or rewrite to `variant_label`?
4. Admin UX for variant matrix — inline table editor or separate "Manage Variants" modal?
5. Parts products — does each variant need its own image set (gallery) or single image?
6. SKU autogeneration — naming scheme (PROD-SIZE-COLOR) or admin-entered?
7. CSV import — defer to Phase 16.x or ship in this phase?
8. Legacy `productVariants.size` — drop column or keep for rollback window?

## Execution Plan (per user directive)

- **Plan phase:** opus model (high reasoning for schema + migration design)
- **Execute phase:** sonnet model
- **Minor tasks / parallel subagents:** haiku where possible

## Entry Points for Next Session

```
/clear
/gsd-discuss-phase 16        # optional — surface gray areas
/gsd-plan-phase 16           # uses opus (set via /gsd-set-profile quality before, or override)
/gsd-execute-phase 16        # uses sonnet
```

If `gsd-sdk` binary fix from the 2026-04-24 agent succeeded, the flow is standard. If not, manual edits continue to work — `node ~/.claude/get-shit-done/bin/gsd-tools.cjs <cmd>` is the fallback.
