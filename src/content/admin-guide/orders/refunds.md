---
title: How to issue a refund
category: Orders
tags: [refunds, payments, paypal]
order: 3
---

# How to issue a refund

Refunds are processed through PayPal. The money goes back to the customer's original payment method.

## When to issue a refund

- Customer received a damaged or incorrect product
- You can't fulfil the order (out of filament, printer broke)
- Customer requested a return and you've agreed
- Order was cancelled after payment

## How to issue a refund

1. Go to **Payments** in the sidebar.
2. Find the order using the date filter or by looking in **Orders** and opening the order.
3. In the Payments list, click the order number.
4. On the payment detail page, click **Issue refund**.
5. Enter the refund amount (you can do a partial refund by entering less than the full total).
6. Add a reason (optional — for your records).
7. Click **Confirm refund**.

PayPal processes the refund immediately. It takes **1–5 business days** for the money to appear in the customer's account, depending on their bank.

## Partial refunds

You can issue multiple partial refunds on the same order, up to the total captured amount. For example, if an order was MYR 95 and you want to refund shipping only (MYR 15), enter `15.00`.

The refund history on the payment detail page shows every refund issued, with amounts, timestamps, and reasons.

## Checking refund status

After issuing a refund, the payment detail page shows the refund in the history. The order in the **Payments** list shows a yellow "partial" or red "full" badge in the Refunded column.

## Limits

- You cannot refund more than the total captured amount
- Once fully refunded, the Refund button is disabled
- Refunds must be issued within 180 days of the original payment (PayPal policy)

**Admin page:** `/admin/payments/[orderId]/refund`
