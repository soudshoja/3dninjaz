---
title: Products, variants, and how they work
category: Products
tags: [products, variants, overview]
order: 1
---

# Products, variants, and how they work

Every item in your store is a **product**. Each product can have up to three **options** (e.g., Size, Color, Part), each with its own set of **values**. The system auto-generates a **variant** for every combination of values — each with its own price, stock, SKU, and image.

## The structure

```
Product
 ├── Basic info: name, description, category, photos
 └── Options (e.g. Size, Color)
      ├── Option values (e.g. Small, Medium, Large)
      └── Variants — auto-generated for each combination
           ├── Small / Red — price, cost data, stock, SKU, image
           ├── Small / Blue — price, cost data, stock, SKU, image
           └── Medium / Red — price, cost data, stock, SKU, image
```

Each variant is independent. You can set different prices, stock levels, and images per variant.

## Key fields explained

**Name and description** — What customers see on the product page and in Google search results. Write clearly and describe the material (e.g., "PLA plastic"), dimensions, and what makes it unique.

**Category / Subcategory** — Groups products in the shop filter. You must create categories first (see the [Categories guide](/admin/guide/products/categories)).

**Active toggle** — Only active products appear in the storefront. Inactive products are hidden from customers but remain in the database. Use this to take a product offline temporarily without deleting it.

**Featured toggle** — Featured products appear in the "Featured" section on the homepage. Pick your best sellers.

**Material type** — Optional. Shown on the product page (e.g., "PLA", "PETG", "Resin").

**Estimated production days** — How many working days it takes to print and dispatch. Shown to customers at checkout.

## Variants in detail

Each variant has:
- **Selling price** — what the customer pays
- **Cost fields** (optional) — filament grams, print time, labor minutes, used to calculate your profit margin
- **SKU** — optional internal reference code
- **Image** — optional per-variant image shown in the gallery when selected
- **Inventory tracking** — optional; see the [Inventory guide](/admin/guide/products/inventory)

## Photos

You can upload multiple photos per product. The first photo (index 0) is the thumbnail shown on listing cards. You can drag to reorder them, or choose a different thumbnail.

**Tip:** Aim for square photos (1:1 ratio) with a clean white or neutral background. They display best on product cards and reduce load time.

## Where to manage products

Go to **Products** in the sidebar to see all products. Click any product name to edit it. Use **+ New product** to add a new one.
