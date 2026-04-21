---
title: Cancelling an order (manual process)
category: Orders
tags: [cancel, orders]
order: 5
---

# Cancelling an order (manual process)

Order cancellation is currently a manual process. There's no automated "cancel" flow — you update the status yourself and handle the refund separately if the customer has already paid.

## How to cancel an unpaid order

1. Open the order from **Orders**.
2. In the **Update status** section, change the status to **Cancelled**.
3. Add an internal note explaining why (e.g., "Customer requested cancellation by WhatsApp").
4. Click **Update**.

No refund is needed for unpaid orders.

## How to cancel a paid order

1. First, issue a refund. Go to **Payments**, open the order, and issue a full refund. See the [Refunds guide](/admin/guide/orders/refunds).
2. Once the refund is processed, go back to **Orders** and update the status to **Cancelled**.
3. Add a note (e.g., "Cancelled on customer request — full refund issued via PayPal").

**Important:** Always process the refund before marking as cancelled. Marking as cancelled without a refund does not automatically return the money to the customer.

## Customer cancel/return requests

Customers can submit a cancel or return request from their account page. These requests appear on the **order detail page** in the admin panel, under the "Requests" section.

You can **approve** or **reject** each request:
- Approving a cancel request = you agree to cancel. You still need to manually update the status and issue a refund if paid.
- Approving a return request = you agree to accept the return. Arrange the return shipping with the customer via WhatsApp.

**Note:** Automated cancellation emails are on the roadmap but not yet sent automatically. If you cancel an order, notify the customer via WhatsApp or email manually.
