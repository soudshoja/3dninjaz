---
title: How to add a new product
category: Products
tags: [products, add, new]
order: 2
---

# How to add a new product

1. Go to **Products** in the sidebar.
2. Click **+ New product** (top right).
3. Fill in the **Name** — keep it short and descriptive (e.g., "Mini Dragon Figurine").
4. Write a **Description** — tell customers what it's made of, the size range, and any custom options.
5. Choose a **Category** (and subcategory if you have them set up).
6. Set the **Material type** if relevant (e.g., PLA, PETG, Resin).
7. Enter **Estimated production days** — how many working days from order to dispatch.
8. Enter a **Shipping weight (kg)** — used as the default weight for courier quotes. You can override per-variant later.

## Uploading photos

1. In the **Photos** section, click the upload area or drag-and-drop images.
2. Upload 3 to 5 photos per product.
3. The first photo is the thumbnail on listing cards. You can choose a different thumbnail by clicking the star icon.

## Setting active / featured

- **Active** — must be on for the product to appear in the storefront. Off by default on new products — don't forget to enable it.
- **Featured** — shows the product in the homepage "Featured" section.

## Saving the product

Click **Save product** at the bottom. You'll be taken to the product edit page.

## Adding variants (sizes, colors, etc.)

After saving the product, click **Manage Variants** to set up your options and prices.

1. Add your option types (e.g., Size, Color, Part).
2. Add values for each option (e.g., S / M / L for Size).
3. Click **Generate Variant Matrix** — the store creates a row for each combination.
4. Set the **price**, **stock**, **SKU**, and optionally an **image** and **weight** for each variant.
5. Mark one variant as the **Default** — it's shown pre-selected on the product page.
6. Save variants.

See the full [Options, values, and variants guide](/admin/guide/products/variants-sizes) for details on pre-order, sale pricing, and weight per variant.

## Adding cost data (optional but recommended)

Each variant has a **Cost** section. Fill it in to track your profit margin:

- **Filament grams** — how much filament does this variant use?
- **Print time (hours)** — total hours in the printer
- **Labor minutes** — packing, post-processing, QC time
- **Other cost** — any extra materials (supports, supports removal, etc.)

Leave any field blank to fall back to your store-wide defaults (set in Settings → Cost Defaults).

**Verify:** Open `/shop` in the storefront. Your product should appear if it's active. Click it to check the variant selector, prices, and photos look correct.

**Tip:** Empty cost fields are fine — they default to store-level defaults from Settings. Only override per-variant if that variant uses significantly more or less filament.
