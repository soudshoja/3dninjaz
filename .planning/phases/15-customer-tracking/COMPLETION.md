# Phase 15 — Customer + Admin Shipment Tracking

**Status:** COMPLETE  
**Completed:** 2026-04-20  
**Session:** 2026-04-20

## Goal

Surface live Delyva tracking timeline on customer order detail page (`/orders/[id]`) and enrich admin shipment panel with driver card + live tracking events.

## What Shipped

| Commit | Description |
|--------|-------------|
| `7097f02` | Shared `ShipmentTrackingView` component + `getOrderTracking` server actions |
| `f60b0cd` | Customer `/orders/[id]` — tracking section with timeline + map link |
| `c3dbdac` | Admin orders — enhanced shipment panel with live tracking timeline + driver card |

## Key Decisions

- **Normalized `ShipmentTrackingView`** — single component consumed by both customer and admin views; admin sees driver name/phone, customer does not.
- **`getOrderTracking` server action** — calls Delyva `GET /v3/shipment/{trackingNumber}/tracking`; returns normalized `TrackingEvent[]`.
- **Map link** — customer page shows "Track on map" button linking to Delyva's public tracking URL (`https://delyva.app/track/<trackingNumber>`).
- **Driver card** — admin-only; shows driver name, phone, and estimated delivery window from Delyva API response.
- **No polling** — tracking is fetched on page load only; customer must reload for updates (live polling deferred to post-v1).

## Known Deferred

- Push notifications to customer when status changes (Delyva webhook → notification).
- Estimated delivery time rendering — depends on Delyva returning ETA in tracking events (not always present).
