---
title: How shipping works — Delyva auto-rates
category: Shipping
tags: [shipping, delyva, couriers]
order: 1
---

# How shipping works — Delyva auto-rates

3D Ninjaz supports two shipping methods:

1. **Flat rates** — simple per-state prices you set manually (e.g., "Selangor: MYR 8")
2. **Delyva live rates** — real-time quotes from couriers like J&T, GrabExpress, Lalamove, and MyPos

Most store owners start with flat rates because they're simpler. Delyva is the recommended upgrade once you're shipping regularly.

## How Delyva works

When a customer reaches checkout:

1. They enter their postcode.
2. The store sends their postcode and the order's weight/dimensions to Delyva's API.
3. Delyva returns a list of available couriers with live prices and estimated delivery times.
4. The customer chooses a courier.
5. When you're ready to ship, you **book the courier from the order detail page** — Delyva confirms the booking and provides a label.

## What you need

- A Delyva account at [delyva.com](https://delyva.com)
- Your **API token** and **Company ID** from the Delyva dashboard
- Your **workshop address** (used as the pickup point for couriers)

## Setting up Delyva

See the [Delyva origin address](/admin/guide/shipping/origin-address) and [Rates and markup](/admin/guide/shipping/rates) guides.

## Flat rates as a fallback

If Delyva is not configured, or if Delyva returns no available couriers for a destination, the system falls back to your flat-rate table. It's good practice to keep your flat rates up to date as a safety net.

**Admin page:** `/admin/shipping/delyva`
