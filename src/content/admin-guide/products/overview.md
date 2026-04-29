---
title: Products, variants, and how they work
category: Products
tags: [products, variants, overview]
order: 1
---

# Products, variants, and how they work

Every item in your store is a **product**. Each product can have up to 6 **options** (e.g., Size, Color, Part), each with its own set of **values**. The system auto-generates a **variant** for every combination of values — each with its own price, stock, SKU, image, and shipping weight.

## The structure

```
Product
 ├── Basic info: name, description, category, photos, shipping weight
 └── Options (e.g. Size, Color)
      ├── Option values (e.g. Small, Medium, Large)
      └── Variants — auto-generated for each combination
           ├── Small / Red — price, sale price, cost, stock, SKU, image, weight
           ├── Small / Blue — ...
           └── Medium / Red — ...
```

Each variant is independent. You can set different prices, stock levels, images, and shipping weights per variant.

## Key product fields

**Name and description** — What customers see on the product page and in search results. Write clearly and describe the material (e.g., "PLA plastic"), dimensions, and what makes it unique.

**Category / Subcategory** — Groups products in the shop filter. You must create categories first (see the [Categories guide](/admin/guide/products/categories)).

**Active toggle** — Only active products appear in the storefront. Inactive products are hidden from customers but remain in the database. Use this to take a product offline temporarily without deleting it.

**Featured toggle** — Featured products appear in the "Featured" section on the homepage. Pick your best sellers.

**Material type** — Optional. Shown on the product page (e.g., "PLA", "PETG", "Resin").

**Estimated production days** — How many working days it takes to print and dispatch. Shown to customers at checkout.

**Shipping weight (kg)** — Default weight used when calculating Delyva courier quotes. Individual variants can override this with their own weight.

## Variants in detail

Each variant has:
- **Selling price** — what the customer pays
- **Sale price + schedule** — optional discounted price with optional start/end date
- **Cost fields** (optional) — filament grams, print time, labor minutes, used to calculate your profit margin
- **SKU** — auto-generated reference code; you can override it
- **Image** — optional per-variant photo shown in the gallery when that variant is selected
- **Weight (g)** — overrides the product-level shipping weight for Delyva quotes
- **Track Stock / Stock count** — optional; see the [Inventory guide](/admin/guide/products/inventory)
- **In Stock toggle** — quickly mark a variant available or unavailable
- **Pre-order** — keeps an out-of-stock variant purchasable; shows "Pre-order" label on the product page
- **Default flag** — exactly one variant per product is the default shown when the page loads

For full instructions on setting up options and generating variants, see [Options, values, and variants](/admin/guide/products/variants-sizes).

For made-to-order (configurable) products like custom name keychains, see [Made-to-order products](./made-to-order.md) — for print-on-demand items where customers compose their own configuration.

## Photos

You can upload multiple photos per product. The first photo (index 0) is the thumbnail shown on listing cards. You can drag to reorder them, or choose a different thumbnail.

**Tip:** Aim for square photos (1:1 ratio) with a clean white or neutral background. They display best on product cards and reduce load time.

## Where to manage products

Go to **Products** in the sidebar to see all products. Click any product name to edit it. Use **+ New product** to add a new one. From the product edit page, click **Manage Variants** to set up options, values, and per-variant pricing.
