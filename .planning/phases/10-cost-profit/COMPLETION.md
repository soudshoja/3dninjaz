# Phase 10 — Cost & Profit Tracking

**Status:** COMPLETE  
**Completed:** 2026-04-20 to 2026-04-21  
**Session:** 2026-04-20 to 2026-04-21

## Goal

Track material costs per variant, snapshot unit cost into order items at checkout, display profit per order in admin panel, show "this month profit" widget on dashboard.

## What Shipped

| Commit | Description |
|--------|-------------|
| `265569b` | DB — `cost_price` on `product_variants`, `unit_cost` on `order_items`, `extra_cost` on `orders` |
| `f0ab26c` | Helper — compute order profit ex-shipping |
| `0ee61f3` | Admin products — cost + margin on variant form |
| `0206601` | Admin orders — costs & profit panel with inline edits |
| `9346dec` | Checkout — snapshot `variant.cost_price` into `order_items.unit_cost` at time of purchase |
| `22393da` | Admin dashboard — "this month profit" widget |

## Key Decisions

- **Single cost_price per variant** — not a breakdown (breakdown added in Phase 14).
- **Snapshot at checkout** — `unit_cost` is frozen at order time; price changes don't retroactively alter profit.
- **`extra_cost`** — admin can add ad-hoc costs per order (custom packaging, special materials) inline from order detail.
- **Profit formula:** `(unit_price × qty − unit_cost × qty) summed − shipping_cost − extra_cost`.
- **Admin-only:** cost/profit data never surfaces on customer-facing pages.

## Known Deferred

- Historical orders before Phase 10 have `unit_cost = NULL` — profit panel shows "N/A" for those.
