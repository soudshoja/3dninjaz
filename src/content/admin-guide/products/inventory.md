---
title: Tracking stock and pre-order
category: Products
tags: [inventory, stock, tracking, pre-order]
order: 6
---

# Tracking stock and pre-order

Stock tracking is **off by default**. This is intentional — most 3D printing shops print to order, so there's no pre-made stock to track.

Only turn on stock tracking if you print products in advance and store them physically.

## Turning on stock tracking

1. Open a product for editing.
2. Click **Manage Variants**.
3. In the variant row, toggle **Track Stock** on.
4. Enter the current **stock quantity**.
5. Click **Save**.

Once tracking is on for a variant, customers can only add it to their bag if stock > 0. When stock reaches zero, that variant is hidden from the storefront variant selector and shows as "Out of stock".

## Updating stock

When you receive a new batch of printed items:

1. Open the product for editing.
2. Click **Manage Variants**.
3. Update the stock number for each variant.
4. Save.

There's no automated deduction history — the stock number is a simple count you manage manually.

## Turning tracking off

If you no longer want to track stock on a variant:

1. Toggle **Track Stock** off for that variant.
2. Save.

The variant becomes available regardless of any stock number, allowing customers to order freely again.

## The "In Stock" toggle

Each variant also has an **In Stock** toggle independent of stock counting. If you toggle In Stock off, the variant is hidden from the storefront selector even if track stock is off. Use this to quickly disable a specific variant without deleting it.

## When a variant is hidden from the storefront

A variant is hidden from the product page selector when **any** of these apply:
- **In Stock** is off — and Pre-order is also off
- **Track Stock** is on, stock = 0 — and Pre-order is also off

If Pre-order is on, the variant stays visible regardless of stock or the In Stock toggle.

## Pre-order

Turn on **Pre-order** for a variant to keep it available for purchase even when it is out of stock. The variant shows a **"Pre-order"** badge on the product page instead of "Out of stock". Customers can still add it to their bag and complete checkout.

Use pre-order when:
- You know a popular variant will be restocked soon
- You want to take orders before finishing a print batch
- You're gauging demand before printing

To enable pre-order on a variant:
1. Go to **Manage Variants** for the product.
2. Toggle **Pre-order** on for the relevant variant row.
3. Save.

To end pre-order (when stock is back):
1. Add the new stock quantity.
2. Toggle **Pre-order** off.
3. Save.

**Common mistake:** If a product is unexpectedly showing as out of stock, check whether Track Stock was accidentally left on with stock = 0. Either toggle Track Stock off, top up the stock count, or enable Pre-order to keep it purchasable.
