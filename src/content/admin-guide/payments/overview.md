---
title: How PayPal works — live and sandbox
category: Payments
tags: [paypal, payments, sandbox, live]
order: 1
---

# How PayPal works — live and sandbox

All payments on 3D Ninjaz go through **PayPal**. Customers can pay with a PayPal account or any debit/credit card via PayPal's guest checkout.

## Live vs sandbox mode

The store operates in one of two modes:

| Mode | What it means |
|------|--------------|
| **Sandbox** | Test mode — no real money moves. Use PayPal test accounts to simulate purchases. |
| **Live** | Real mode — customers pay real money into your PayPal business account. |

The mode is set by the `PAYPAL_ENV` environment variable on the server. **Before going live, confirm this is set to `live` with your server administrator.**

## Where payments go

When a customer pays, the money goes directly into your **PayPal Business account**. It's available for withdrawal to your Malaysian bank account according to PayPal's normal processing time (typically 1–3 business days).

## Viewing captured payments

Go to **Payments** in the sidebar to see all captured PayPal transactions. Each row shows:
- Order number
- Customer name and email
- Gross amount (what the customer paid)
- PayPal fee (their processing fee — approximately 3–4% + MYR 2)
- Net amount (what lands in your PayPal account)
- Refunded amount (if any)
- Date and Capture ID

## PayPal fee

PayPal deducts a fee from each transaction. As of 2025, Malaysian merchants pay roughly **3.4% + MYR 2** per transaction. This is shown in the Payments table so you can see your true net earnings.

## Finding a specific payment

Use the date range filter (From / To) on the Payments page to narrow down transactions. You can also filter by refund status (no refunds / partial / full).

**Admin page:** `/admin/payments`
