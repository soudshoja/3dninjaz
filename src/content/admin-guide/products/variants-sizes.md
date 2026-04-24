---
title: Options, values, and variants
category: Products
tags: [variants, options, sizes, pricing, sku, pre-order, stock]
order: 4
---

# Options, values, and variants

Every product can have up to **6 options** — attribute types like Size, Color, Part, Material, Finish, or Style. Each option has a list of **values** (for example, Size has values S, M, L). The store then generates a **variant** for every combination of values.

> **What changed in April 2026:** The old fixed Small/Medium/Large size fields have been replaced by this generic system. Existing products were migrated automatically.

## Understanding the structure

- **Option** = the attribute type (e.g., "Size", "Color", "Part")
- **Value** = a choice within that option (e.g., "S", "M", "L" for Size; "Red", "Blue" for Color)
- **Variant** = one specific combination (e.g., Size: M / Color: Red)

A product with two options — Size (S, M, L) and Color (Red, Blue) — will generate 6 variants: S/Red, S/Blue, M/Red, M/Blue, L/Red, L/Blue.

## Managing variants

Go to the product edit page and click **Manage Variants** (or go directly to `/admin/products/<product-id>/variants`).

### Step 1 — Define your options

1. Click **Add option**.
2. Choose the option type from the dropdown (Size, Color, Part, Material, Finish, Style).
3. Add values for that option — type each value and press Enter. You can drag values to reorder them.
4. Repeat for up to 6 options.

### Step 2 — Generate the variant matrix

Once your options and values are set, click **Generate Variant Matrix**. The store expands all option/value combinations into individual variant rows. Existing variants that already have sales history are kept as-is and merged in.

### Step 3 — Fill in each variant row

Each variant row has these editable fields:

| Field | What it does |
|-------|-------------|
| **Price (MYR)** | The selling price customers see |
| **Sale price** | Optional discounted price. Set a start and end date to schedule a sale |
| **Stock** | Number of units on hand (only used when Track Stock is on) |
| **Track Stock** | Toggle on to deduct stock when orders are placed |
| **In Stock** | Quick toggle to mark a variant available or unavailable (overrides stock count) |
| **SKU** | Internal reference code. Auto-generated as `3DN-{SLUG4}-{INITIALS}` but you can override it |
| **Image** | A photo specific to this variant. Shown in the product gallery when the customer selects this variant |
| **Weight (g)** | Shipping weight in grams. Overrides the product-level weight for Delyva courier quotes |
| **Pre-order** | See below |
| **Default** | The variant shown first when a customer opens the product page |

### Setting a default variant

Exactly one variant per product is the default. Mark it with the **Default** toggle. Marking a new variant as default automatically unmarks the previous one. The default variant is shown pre-selected on the product page.

### Pre-order

Turn on **Pre-order** for a variant to keep it purchasable even when it is out of stock (tracked stock = 0 or "In Stock" is off). The variant shows a "Pre-order" label on the product page instead of "Out of stock", and customers can still add it to their bag.

Use this for popular variants that you know you will restock soon.

### How out-of-stock works

A variant is hidden from the storefront selector when:
- **In Stock** is toggled off, **and** Pre-order is off
- **or** Track Stock is on, stock has reached 0, **and** Pre-order is off

If Pre-order is on, the variant stays available regardless of stock.

### Variant image hover preview

On the product page, hovering over a variant pill or swatch shows a preview of that variant's image (if one was uploaded). This helps customers see color or style differences before clicking.

## Shipping weight per variant

The weight used for Delyva courier quotes follows this priority:

1. Variant's own **Weight (g)** field (if filled in)
2. Product-level **Shipping weight** (if the variant weight is blank)
3. Default fallback: 1 kg

Fill in per-variant weights when your variants differ significantly in weight (e.g., a Large figurine vs. a Small one).

## SKU format

SKUs are auto-generated when you create a variant: `3DN-{first 4 chars of slug}-{option initials}`. Example: a Size M / Color Red variant of the "Mini Dragon" product might get `3DN-MINI-MR`. You can override the SKU at any time — just type in the field.

**Admin page:** `/admin/products/<id>/variants`
