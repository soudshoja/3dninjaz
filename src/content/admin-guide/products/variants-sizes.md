---
title: Sizes, prices, and per-size cost
category: Products
tags: [variants, sizes, pricing, cost]
order: 4
---

# Sizes, prices, and per-size cost

Each product can have up to three sizes: **Small**, **Medium**, and **Large**. You choose which sizes to enable — you don't need to offer all three.

## Enabling a size

When creating or editing a product, scroll to the **Sizes & Pricing** section. Toggle each size on or off. Only enabled sizes appear in the storefront size selector.

## Setting the selling price

Each enabled size gets its own **selling price** in MYR. This is what the customer pays — before any applicable SST (which is added at checkout if enabled in Settings).

There's no rule about how much to charge per size. A common approach:
- Small = base price
- Medium = Small × 1.5
- Large = Small × 2.5

Adjust based on how much more filament and print time each size requires.

## Dimensions (optional)

Each size has optional width, height, and depth fields in centimetres. These are shown on the product page so customers know what they're getting. Fill them in when you have a consistent mould for each size.

## Per-size cost breakdown (optional)

Each size has a **Cost** section with these fields:

| Field | What to enter | Example |
|-------|--------------|---------|
| Filament grams | How much filament for this size | `45` (45g for a small figurine) |
| Print time (hours) | Total hours in the printer | `2.5` |
| Labor minutes | Packing + QC time in minutes | `15` |
| Other cost (MYR) | Any extra materials | `0.50` |
| Filament rate override (MYR/kg) | Leave blank to use store default | _(blank)_ |
| Labor rate override (MYR/hr) | Leave blank to use store default | _(blank)_ |

When you fill in these fields, the admin panel shows a **live cost total** and the resulting margin at the current selling price.

Leave all cost fields blank if you don't want to track profit — the product will still sell normally.

## Inventory tracking per size

Each size can optionally have inventory tracking. See the [Inventory guide](/admin/guide/products/inventory) for details.

**Tip:** Most 3D printing shops work on-demand (print-to-order) so inventory tracking isn't necessary. Only turn it on if you pre-print batches and need to track how many you have in stock.
