---
created: 2026-05-30T02:01:57.867Z
title: Push & open PR for order-tracking-map-eta-label branch
area: general
files:
  - src/lib/shipment-tracking.ts
  - src/actions/shipping.ts
  - src/components/orders/order-tracking-timeline.tsx
  - src/components/admin/order-shipment-panel.tsx
  - src/app/api/admin/orders/[id]/label/route.ts
---

## Problem

Order courier-tracking UX work is committed but NOT pushed. Branch `fix/order-tracking-map-eta-label` (commit 55b3832, 6 files +298/−36) was branched off `fix/storefront-revalidate-on-admin-changes`. Need to decide the push/PR target and ship via the CI pipeline (deploy = push dev/master only; CI builds first — never manual-SSH build).

What shipped in the commit:
1. Live map hidden unless courier is live-trackable (INSTANT serviceType or driver GPS coords) — drop couriers no longer show a blank embed.
2. Customer tracking view = status + estimated delivery + event history only; consignment no./driver card/map are admin-only.
3. ETA derived from `shipping_service_catalog` etaMin/MaxMinutes; hidden when absent.
4. Admin "Track parcel" external button (Delyva strack; works for every courier).
5. Label PDF route returns branded HTTP-200 HTML error page; friendly "already collected, cannot reprint" case; never names the courier-aggregator vendor.

`tsc --noEmit` passes clean. Repo has no eslint flat-config (lint is tsc-only).

## Solution

Decide base: open PR targeting `dev` (or the storefront-revalidate branch if those changes should land together), then merge to trigger CI deploy. After deploy, smoke-test on app.3dninjaz.com: (a) a drop-courier order shows NO map and no blank embed, (b) customer order page shows status + events (+ ETA if present) but no consignment/driver, (c) admin "Track parcel" opens the external page, (d) re-printing a collected-parcel label shows the branded friendly page with no vendor name.

Carried-over open items (not this todo, tracked elsewhere): invoice redesign WIP (fix/invoice-match-design), Pos Laju support ticket, enter per-SKU weights, optional POS customer backfill, CI Node20 deprecation, launch blockers in .planning/GO-LIVE-READINESS.md.
