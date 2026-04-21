---
title: Markup and free-shipping threshold
category: Shipping
tags: [shipping, rates, markup, free-shipping]
order: 3
---

# Markup and free-shipping threshold

## Flat rates (per state)

The simplest way to set shipping is per-state flat rates:

1. Go to **Shipping (flat-rate)** in the sidebar.
2. Enter a price (MYR) for each state.
3. Enter `0` for states you don't ship to, or leave them blank.
4. Click **Save**.

These rates appear at checkout when Delyva is not configured or returns no results.

## Free-shipping threshold

Set a minimum order value above which shipping is free:

1. Go to **Settings** in the sidebar.
2. Find the **Free-shipping threshold** field.
3. Enter a MYR value (e.g., `200.00`).
4. Save.

When a customer's order subtotal reaches or exceeds this amount, shipping is automatically set to MYR 0.00. We recommend MYR 200 for 3D Ninjaz — it encourages larger orders.

Leave the field blank to disable free shipping.

## Delyva price markup

If you want to add a buffer on top of Delyva's live courier rates (to cover packaging materials or as a small margin):

1. Go to **Delyva courier** in the sidebar.
2. In the **Price adjustment** section:
   - **Markup percent** — e.g., `10` adds 10% to all Delyva quotes
   - **Flat fee (MYR)** — a fixed amount added to every Delyva quote
3. Save.

Most small stores set both to zero and charge raw courier rates. Adjust if your packaging costs are significant.

**Tip:** The free-shipping threshold applies to both flat rates and Delyva quotes. If the order total exceeds the threshold, shipping is always free regardless of which method is used.
