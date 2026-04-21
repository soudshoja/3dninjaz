---
title: Tracking — what the customer sees
category: Shipping
tags: [tracking, shipping, customer]
order: 5
---

# Tracking — what the customer sees

Once you've booked a shipment, customers can track their parcel through their account.

## What the customer sees

On the customer's order page (`/orders/[id]`), the **tracking timeline** shows:

- The current status (e.g., "Picked up", "In transit", "Out for delivery")
- Each status update with a timestamp
- The courier name and consignment number
- A driver card when the courier is out for delivery (name, vehicle, contact — if the courier provides this)

The tracking data comes live from Delyva and updates whenever the customer refreshes the page.

## What the admin sees

On the admin order page, the same tracking timeline appears below the shipment panel. You see the same view as the customer, plus the Delyva booking details and action buttons.

## Refreshing tracking status

If you want to force a status refresh (for example, to check if a parcel has been picked up):

1. Open the order in the admin panel.
2. In the **Shipping** section, click **Refresh status**.
3. The tracking timeline updates with the latest data from Delyva.

## Tracking number format

The tracking number format varies by courier:
- **J&T**: `JT...` format
- **GrabExpress**: alphanumeric booking reference
- **Lalamove**: booking order number

Customers can also track their parcel directly on the courier's website using this number if they prefer.

**Note:** Tracking status can take 1–4 hours to appear after pickup, as couriers update their systems in batches. If the status shows "Pending pickup" for several hours, that's normal — it means the courier hasn't scanned the parcel yet.
