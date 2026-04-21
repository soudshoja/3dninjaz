# Phase 14 — Cost Breakdown with Store Defaults

**Status:** COMPLETE  
**Completed:** 2026-04-21  
**Session:** 2026-04-20 to 2026-04-21

## Goal

Replace single `cost_price` with a full material cost breakdown (filament weight, electricity, labor hours, overhead) using store-level defaults from `/admin/settings`; auto-compute `cost_price` from breakdown.

## What Shipped

| Commit | Description |
|--------|-------------|
| `98cf6de` | DB — store cost defaults + per-variant cost breakdown columns |
| `08acb81` | Lib — variant cost breakdown computation helper + Drizzle schema mirror |
| `c07536a` | Admin settings — cost defaults section (filament $/g, electricity $/kWh, labor $/hr, overhead %) |
| `4f130b6` | Admin products — Cost tab with live breakdown + auto-computed `cost_price` |
| `d421bd9` | Fix auth — resolve Better Auth "Invalid origin" rejection |

## New DB Columns on `product_variants`

- `filament_weight_g` DECIMAL(8,2) — grams of filament used
- `print_time_hr` DECIMAL(6,2) — print hours
- `labor_time_hr` DECIMAL(6,2) — post-processing hours
- `overhead_pct` DECIMAL(5,2) — overhead percentage override (NULL = use store default)

## New `store_settings` Keys

- `cost_filament_per_g` — RM per gram of filament
- `cost_electricity_per_kwh` — RM per kWh
- `cost_labor_per_hr` — RM per labor hour
- `cost_overhead_pct` — default overhead percentage

## Cost Formula

```
filament_cost = filament_weight_g × cost_filament_per_g
electricity_cost = print_time_hr × printer_wattage_kw × cost_electricity_per_kwh
labor_cost = labor_time_hr × cost_labor_per_hr
subtotal = filament_cost + electricity_cost + labor_cost
overhead = subtotal × (overhead_pct / 100)
cost_price = subtotal + overhead   (rounded to 2 dp)
```

Printer wattage defaults to 0.2 kW (200W — configurable via store default).

## Key Decisions

- **Live preview** — Cost tab in product form shows breakdown table updating in real-time as fields change (client-side JS, no round-trip).
- **Auto-write** — On variant save, computed `cost_price` is written to DB; admin can still override `cost_price` directly.
- **Store defaults as fallback** — if variant has `overhead_pct = NULL`, uses store `cost_overhead_pct`.
- **Better Auth `trustedOrigins` fix** — `d421bd9` adds `https://3dninjaz.com` to `trustedOrigins` in `src/lib/auth.ts`; previously admin form POSTs from prod domain were rejected with "Invalid origin".

## Known Deferred

- Electricity cost requires knowing printer wattage — currently hardcoded to 200W. Per-product wattage field deferred.
