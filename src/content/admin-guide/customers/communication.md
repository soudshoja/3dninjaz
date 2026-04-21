---
title: Email templates — subject lines and copy
category: Customers
tags: [email, templates, communication]
order: 3
---

# Email templates — subject lines and copy

Every automated email the store sends is based on a **template** you can edit. You don't need to know code — just edit the subject and body text in plain HTML.

## Available templates

| Template | When it's sent |
|----------|---------------|
| Order confirmation | Immediately after payment is captured |
| Order shipped | When you update the order status to Shipped |
| Order delivered | When you update the order status to Delivered |
| Order refunded | After a refund is issued |
| Order cancelled | After an order is cancelled |
| Password reset | When a customer requests a password reset |
| Password changed | After a customer changes their password |
| Welcome email | When a new account is created |
| Newsletter welcome | When someone subscribes to the newsletter |
| Newsletter unsubscribed | When someone unsubscribes |
| Dispute opened (customer) | When a dispute is opened in PayPal |
| Dispute opened (admin) | Admin notification when a dispute is opened |

## How to edit a template

1. Go to **Email templates** in the sidebar (under Marketing).
2. Click **Edit** next to the template you want to change.
3. Edit the **Subject** line.
4. Edit the **Body** — it's HTML. The preview on the right updates as you type.
5. Click **Save**.

## Template variables

Use `{{variable}}` placeholders in your templates. The server replaces them with real data at send time. Common variables:

- `{{name}}` — customer's first name
- `{{orderNumber}}` — the order number (e.g., #1042)
- `{{trackingNumber}}` — courier tracking number
- `{{storeName}}` — your business name

**Check the template editor for the full list of available variables** — it shows which variables are valid for each template.

## Tips for good email copy

- Use the customer's name: "Hi {{name}}" feels personal
- Keep it short — one screen, no scrolling needed
- Include a link to the relevant order page
- Write subject lines that are clear: "Your 3D Ninjaz order is on its way!" beats "Order update"

**Admin page:** `/admin/email-templates`
