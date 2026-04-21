---
title: Enabling maintenance mode
category: Content
tags: [maintenance, downtime, settings]
order: 3
---

# Enabling maintenance mode

Maintenance mode redirects all storefront visitors to a "We'll be right back" page while you make changes or perform maintenance. The admin panel remains accessible so you can work while the store is down.

## When to use it

- Updating a large batch of products and you don't want customers to see half-finished listings
- Server maintenance by your hosting provider
- Running a major sale setup (to avoid orders coming in before prices are ready)

## How to enable

Maintenance mode is controlled by a **server environment variable**. It cannot be toggled from the admin panel — you (or your server administrator) must change it on the server.

**To enable:**
Set `MAINTENANCE_MODE=true` in your server environment, then restart the Node.js app.

**To disable:**
Set `MAINTENANCE_MODE=false` (or remove the variable entirely), then restart the app.

## What customers see

Customers visiting any storefront page are redirected to `/maintenance` — a branded page with the 3D Ninjaz logo that says the store will be back shortly.

## What stays accessible during maintenance

Even when maintenance mode is on, these remain accessible:
- `/admin/**` — the full admin panel
- `/payment-links/**` — customers paying for manual orders can still complete payment
- `/api/paypal/webhook` — PayPal payment captures continue to process

## Minimising downtime

For product updates, maintenance mode is rarely needed. You can add and edit products without taking the store offline — just leave new products as **inactive** until you're ready to publish them all at once, then activate them together.

**Note:** There is no timer or scheduled enable/disable. You must manually set and unset the environment variable.
