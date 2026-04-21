# Phase 13 — Per-Variant Inventory Track Stock

**Status:** COMPLETE  
**Completed:** 2026-04-21  
**Session:** 2026-04-20 to 2026-04-21

## Goal

Add optional `track_stock` flag per product variant — when enabled, show OOS badge on storefront only when stock is actually tracked; remove separate Inventory admin page (inline in product form instead).

## What Shipped

| Commit | Description |
|--------|-------------|
| `28acf49` | DB — `track_stock` flag on `product_variants` |
| `82d545c` | Admin products — inline stock tracking toggle in variant rows |
| `4fdc982` | Storefront — only show OOS badge when `track_stock` is enabled |
| `54faeb6` | Refactor admin nav — remove separate Inventory item (managed inside product form) |

## Key Decisions

- **`track_stock` is opt-in per variant** — existing variants default `false`, no OOS badge shown until admin explicitly enables tracking.
- **No separate inventory page** — Phase 5's `/admin/inventory` standalone page removed; stock toggle is inline in the product variant form. Reduces nav clutter.
- **OOS badge logic:** `in_stock = false AND track_stock = true` → show "Out of Stock" badge. If `track_stock = false` → no badge regardless of `in_stock` value.
- **No automatic decrement** — stock count not auto-decremented on purchase in v1 (admin manually toggles `in_stock`). Auto-decrement deferred.

## Known Deferred

- Automatic stock decrement on order capture.
- Low-stock threshold alerts (columns exist from Phase 5 `low_stock_threshold` — trigger not wired).
