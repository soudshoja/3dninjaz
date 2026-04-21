---
title: Adding orders that bypass checkout
category: Orders
tags: [manual orders, payment link, whatsapp]
order: 2
---

# Adding orders that bypass checkout

Manual orders let you create an order on behalf of a customer who contacted you via WhatsApp or email, without them going through the online checkout.

This is useful when:
- A customer orders via WhatsApp and wants to pay online
- You're quoting for a custom 3D print job
- A customer can't complete checkout themselves

## How to create a manual order

1. Go to **Orders** in the sidebar.
2. Click **+ New manual order** (top right).
3. Fill in the form:
   - **Customer email** — the customer's email address (they don't need an account, but an account must exist if they're a registered user)
   - **Delivery address** — name, address lines, city, state, postcode
   - **Line items** — add each product and size manually with a price
   - **Shipping amount** — enter a flat shipping amount for this order
   - **Notes** — internal notes (e.g., "WhatsApp order from +60xx")
4. Click **Create order**.

The order is created with status **Pending**.

## Collecting payment

After creating the order:

1. Open the order from **Orders**.
2. In the **Payment** section, click **Generate payment link**.
3. Copy the payment link and send it to the customer via WhatsApp or email.
4. The customer opens the link, clicks PayPal, and pays.
5. The order status automatically updates to **Paid** when payment is captured.

## Payment link expiry

Payment links expire after 24 hours. If the customer hasn't paid by then, generate a new link from the same order page.

## Manual orders vs web orders

Manual orders are identical to web orders once paid — they have the same shipping, tracking, and refund features. The only difference is how they were created and how payment was collected.

**Admin page:** `/admin/orders/new`
