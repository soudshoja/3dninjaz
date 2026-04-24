---
title: How shipping works — Delyva auto-rates
category: Shipping
tags: [shipping, delyva, couriers, parcel, whitelist]
order: 1
---

# How shipping works — Delyva auto-rates

3D Ninjaz supports two shipping methods:

1. **Flat rates** — simple per-state prices you set manually (e.g., "Selangor: MYR 8")
2. **Delyva live rates** — real-time quotes from couriers like J&T, Ninja Van, Pos Laju, and SPX

Most store owners start with flat rates because they're simpler. Delyva is the recommended upgrade once you're shipping regularly.

## How Delyva works

When a customer reaches checkout:

1. They fill in their full shipping address (name, phone, street, city, state, postcode).
2. The store sends their postcode and the order's weight to Delyva's API.
3. Delyva returns a list of available couriers with live prices and estimated delivery times.
4. The customer picks a courier and completes payment.
5. When you're ready to ship, **book the courier from the order detail page** — Delyva confirms the booking and provides a waybill label.

## What you need

- A Delyva account at [delyva.com](https://delyva.com)
- Your **API token** and **Company ID** from the Delyva dashboard
- Your **workshop address** (used as the pickup point for couriers)

## Setting up Delyva

See the [Delyva origin address](/admin/guide/shipping/origin-address) and [Rates and markup](/admin/guide/shipping/rates) guides.

## Approved couriers

The store only shows quotes from a curated whitelist of 12 couriers. This prevents unknown or low-quality couriers from appearing at checkout.

| Courier | Status |
|---------|--------|
| Ninja Van MY | Active |
| J&T Express MY | Active |
| SPX MY | Active |
| City-Link MY | Active |
| Pos Laju MY | Active |
| SF International | Active |
| Ninja Van MY (drop-off) | Active |
| Pos Malaysia (POSMY) | Needs merchant provisioning |
| Ninja Van MY Roadside | Needs merchant provisioning |
| Ninja Van MY (international) | Needs merchant provisioning |
| Ninja Van Doorstep MY (international) | Needs merchant provisioning |
| SF International (GE) | Needs merchant provisioning |

Couriers marked "Needs merchant provisioning" will appear once your Delyva account has those services enabled. Contact Delyva support to activate them.

## Refreshing the courier catalog

After your Delyva account is updated with new services, go to **Shipping → Delyva** in the sidebar and click **Refresh courier catalog**. This fetches the latest list from Delyva and updates the whitelist matching.

**Admin page:** `/admin/shipping/delyva`

## Parcel type — important

All shipments are sent as **PARCEL** type. An older setting called "PACKAGE" routes orders to Grab-only fulfillment and returns zero standard couriers. The store automatically corrects any PACKAGE setting to PARCEL — no action needed on your part.

## 30 kg parcel cap

Delyva does not accept single shipments over 30 kg. If an order's total weight exceeds 30 kg, the store shows a friendly error at checkout and the customer cannot select a courier. In this case, contact the customer to arrange a manual shipping quote (WhatsApp or email) and mark the order as shipped manually from the order detail page.

## Flat rates as a fallback

If Delyva is not configured, or if Delyva returns no available couriers for a destination, the system falls back to your flat-rate table. Keep your flat rates up to date as a safety net.

## Duplicate webhook deliveries

Delyva occasionally re-sends shipping status webhooks. The store handles this automatically — duplicate updates are silently ignored, so order status won't be updated twice.
