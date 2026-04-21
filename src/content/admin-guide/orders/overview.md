---
title: Orders — the life cycle
category: Orders
tags: [orders, status, lifecycle]
order: 1
---

# Orders — the life cycle

Every purchase creates an order. Orders move through a series of statuses as you process, pack, and ship them.

## Order statuses

| Status | Meaning |
|--------|---------|
| **Pending** | Order created but payment not yet captured (rare for web orders; common for manual orders awaiting payment) |
| **Paid** | PayPal payment captured. Ready to print and pack. |
| **Processing** | You've started working on the order (optional intermediate step) |
| **Shipped** | Courier booked and parcel handed over. Tracking number assigned. |
| **Delivered** | Parcel delivered to customer |
| **Cancelled** | Order cancelled (see below) |
| **Refunded** | Full or partial refund issued |

## How to change an order's status

1. Open the order from **Orders** in the sidebar.
2. In the **Update status** section, choose the new status from the dropdown.
3. Optionally add an internal note (visible to admin only, not the customer).
4. Click **Update**.

## Order timeline

Every status change is recorded in the **Timeline** section of the order page. This gives you a full history of when the order moved through each stage, along with any notes.

## Finding a specific order

The Orders page lists all orders, newest first. Use the **status filter** tabs at the top to narrow down to Paid, Shipped, etc.

## What's on the order page

- Customer name and email
- Delivery address
- Line items (products, sizes, quantities, prices)
- Payment status and PayPal capture ID (for paid orders)
- Shipping panel (courier booking and tracking)
- Cost and profit panel (if cost data was entered on the product)
- Refund history (if any refunds were issued)
- Status change form
- Internal notes
- Requests (cancel/return requests from the customer)

**Admin page:** `/admin/orders`
