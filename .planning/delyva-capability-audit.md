# Delyva API Capability Audit — 3D Ninjaz

**Date:** 2026-04-20
**Author:** Claude (shipping-ops subagent)
**Scope:** What Delyva's API actually offers, what we use today, and what's worth building next.

All endpoint probes were run live against `https://api.delyva.app/v1.0` with the account `DELYVA_CUSTOMER_ID=126795`. Where an endpoint is listed as "confirmed", it returned a 200 with a usable payload. Where listed as "404/400", the path doesn't exist (or needs params we didn't supply).

---

## 1. Currently implemented

- `POST /service/instantQuote` — rate quote (fixed shape this session; see `src/lib/delyva.ts` `parseQuoteServices`)
- `POST /order` (with `process: false`) — draft creation
- `POST /order/{id}/process` — dispatch
- `GET  /order/{id}` — order detail, used for consignment/tracking/personnel
- `GET  /order/{id}/label` — single PDF label
- `POST /order/{id}/cancel` — cancel
- `POST /webhook` — register `order.created`, `order.failed`, `order_tracking.change`, `order_tracking.update`
- `GET  /user` — for apiSecret bootstrap
- `GET  /webhook` — list subscriptions (only used implicitly during registerWebhooks flow)

---

## 2. Confirmed capabilities NOT yet used

Verified live today. All return 200 unless noted.

| Capability | Endpoint | Notes |
|---|---|---|
| List ALL couriers for the account | `GET /service` | Returns every service tier available globally (paginated). Useful to populate the admin allowlist without relying on a sample-corridor quote. 30 rows per page. |
| Service detail | `GET /service/{id}` | Full config including timeSlot, operationType, min/max weight & distance, plugin flags. |
| List orders (paginated) | `GET /order?page=&limit=&startDate=&endDate=` | Confirmed — returns paginated array (empty for our account; admin could sync orders booked outside our app). |
| **Order export to Excel** | `GET /order/export` | Returned a valid `.xlsx` file (15 KB) with no params. Fantastic for admin reports without building our own export pipeline. |
| Customer/account profile | `GET /customer/{id}` | Returns wallet balance, unbilled amount, plan name, planExpiryDate, minBalanceVal, fixedTopup, selectedServices, includedServices, notifications — **contains all the billing/wallet fields we need.** |
| Wallet balance | (Embedded in `/customer/{id}.walletBalance` + `unbilledAmount` + `minBalanceVal`) | No separate `/wallet` endpoint — but the data is available on the customer row. `minBalanceVal` is the admin's low-balance alert threshold (we saw `20.00`). |
| Bulk labels | `GET /order/{id1},{id2}/label?packingList=true` | Works per docs; never wired into admin UI. |
| Listing webhooks | `GET /webhook` | We currently see 5 subs including a **duplicate** `order.created` (ids 11244 & 11245). Delete-by-id endpoint works via `DELETE /webhook/{id}`. |
| Delete webhook | `DELETE /webhook/{id}` | Per docs; not wired. Would let us deduplicate subs on re-register. |
| Tracking timeline on order | `GET /order/{id}` returns a `tracking[]` array | We persist only the latest status — we don't render the event history anywhere. |
| Live driver coords | `GET /order/{id}` returns `personnel.coord.{lat,lon}` for instant services | Could drive a real-time map instead of (or alongside) the Delyva iframe. |
| Service-level capability flags | `service.operationType.{cod,pickup,dropoff}` and `service.multiPcs` | We ignore these — could filter what we advertise per checkout mode. |
| COD add-on via quote | `serviceAddon: [{ id: -1, value: "<MYR>" }]` in quote body + `cod: {}` at order creation | Code types exist in `CreateOrderInput.cod`; UI does not surface the toggle. |
| Insurance via quote | `serviceAddon: [{ id: -3, value: "<MYR>" }]` + `insurance: {}` at order | Same status as COD — types exist, no UI. |
| International services | Real codes exist (`CLEXMY-PN-Z8-P` = City-Link Express Intl, RM 189) | Returned in our quote sample; never surfaced at checkout (we filter on MY-only corridors). |

## Endpoints probed and NOT found (400/404)

`/wallet`, `/wallet/balance`, `/transaction(s)`, `/invoice`, `/analytics`, `/report`, `/pickup*`, `/return*`, `/orderEvent`, `/auth/totp`, `/address`, `/location`, `/postcode*`, `/country`, `/state`, `/serviceGroup`, `/label/template`, `/accounting/*`.

> Wallet / billing / reporting are **not** exposed as dedicated endpoints. The only billing data we can read is the embedded fields on `GET /customer/{id}` and the Excel file from `GET /order/export`. Good to know — it caps what a "Shipping finance dashboard" feature could do without contacting Delyva support for their admin API.

---

## 3. Feature ideas ranked by ROI

### HIGH ROI (ship next quarter)

- **H1 — Customer-facing tracking page** (`/orders/{id}/track`)
  Render the `tracking[]` timeline from `GET /order/{id}` as a vertical step list ("Picked up → In transit → Out for delivery → Delivered") plus the existing Delyva iframe map while the status is pre-delivery. Eliminates "where is my order?" support emails. Uses only already-persisted shipment data + one extra Delyva call per page load.
- **H2 — Admin bulk-label print + bulk-book**
  New `/admin/shipments` screen listing unshipped paid orders with a "Select + Print labels" button. Batch endpoint `GET /order/{id1,id2,…}/label?packingList=true` returns a single PDF. Saves minutes per day once order volume climbs.
- **H3 — COD toggle at checkout (MY-market fit)**
  COD is huge in Malaysia (~30% of e-commerce). Storefront: if the shopper toggles "Pay cash on delivery", the cart sends `serviceAddon: [{id:-1,value:<total>}]` on quote; only `COD-*` service codes are shown. On order creation, send `cod: {currency:"MYR", amount:<total>}`. Schema: add `orders.payment_method` ENUM('paypal','cod') + optional `orders.cod_amount`.

### MEDIUM ROI (roadmap)

- **M1 — Service comparison UX at checkout**
  Today the rate picker is a plain radio list. Enhance with courier logos (`service.serviceCompany.logo`), drop-off-only badges (`serviceType: NDD-DROP` → "You drop off"), ETA days, and a "cheapest/fastest" highlight. Higher conversion, no new schema.
- **M2 — Pickup scheduling per order**
  Admin picks `origin.scheduledAt` manually (today we hardcode now+24h). Add a datetime picker on the booking panel; persist to shipment row for audit.
- **M3 — Insurance opt-in for orders > RM 200**
  Auto-add `serviceAddon: [{id:-3,value:<subtotal>}]` + `insurance: {}` when cart subtotal crosses a config threshold. Small margin gain + customer trust.
- **M4 — Nightly order reconciliation via `GET /order?startDate=&endDate=`**
  Cron walks yesterday's Delyva orders and flags any row in Delyva that has no matching `order_shipments` row (or vice versa). Catches manual bookings and half-booked states.
- **M5 — Webhook dedup via `GET /webhook` + `DELETE /webhook/{id}`**
  `registerWebhooks` today blindly POSTs and creates duplicates (we have two `order.created` subs right now). Read-before-write: list, dedupe, delete extras, register missing.

### LOW ROI (nice-to-have)

- **L1 — International shipping** — we already see `CLEXMY-PN-Z8-P` at RM 189 in quote responses; unlocks expansion. Not urgent for MY-first v1.
- **L2 — Returns** — no dedicated endpoint; workaround is a reverse-direction order with swapped origin/destination. Nice for warranty claims when volume justifies.
- **L3 — Wallet widget in admin** — embed `walletBalance` + `unbilledAmount` from `/customer/{id}` on the admin shipping page. Prevents "wallet empty → booking fails" surprise. But `minBalanceVal` already feeds email alerts from Delyva themselves.
- **L4 — Excel export button** — `/order/export` returns a ready `.xlsx`. A single admin link could proxy it with the API key header. 20-line feature.

---

## 4. Recommended next phase (3 picks)

### Phase 9c — Customer tracking page (H1)

- **Route:** `src/app/(store)/orders/[orderId]/track/page.tsx` (server component)
- **Guard:** session user owns the order, OR the URL carries a signed `trackingToken` from the confirmation email
- **Data flow:**
  1. Server component loads `orders` + `order_shipments` by id
  2. If `shipment.delyvaOrderId` present, call `delyvaApi.getOrder(delyvaOrderId)` server-side → render `tracking[]` timeline
  3. Embed Delyva iframe map when `consignmentNo` present and status ∉ {90, 400+}
- **Schema:** none — existing columns sufficient
- **Effort:** S (~½ day)

### Phase 9d — Admin bulk-labels + shipments index (H2)

- **Route:** `src/app/(admin)/admin/shipments/page.tsx` with a checkbox column and a sticky "Print labels (n)" button
- **New API route:** `src/app/api/admin/shipments/labels/route.ts` — accepts `?ids=a,b,c`, calls `GET /order/<ids>/label?packingList=true` server-side, streams the PDF back with `Content-Disposition: attachment`
- **Server action:** batch `bookShipmentForOrder` for multiple orders at once (sequential — Delyva rate-limits)
- **Schema:** none
- **Effort:** M (~1½ days)

### Phase 9e — COD at checkout (H3)

- **Schema changes:** `orders.payment_method ENUM('paypal','cod') NOT NULL DEFAULT 'paypal'`, `orders.cod_amount DECIMAL(10,2) NULL`
- **Storefront:** checkbox in checkout "Pay cash on delivery (Malaysia only, +RM 2 handling)" — gated on `destination.country === 'MY'`
- **Quote flow:** when COD on, filter `shipping-quote.ts` options to services whose `serviceType` starts with `COD-`, AND pass `serviceAddon: [{id:-1,value:<total>}]`
- **Order flow:** when `payment_method='cod'`, skip PayPal server action; create order row as `status='pending_cod_delivery'`; book Delyva with `cod: {currency:"MYR", amount}`
- **Admin UI:** mark COD orders with a badge; once webhook says delivered, require admin to mark "COD cash received" before revenue counts toward profit
- **Effort:** L (~3 days — involves payment-flow branching)

---

## 5. API gaps / surprises

- **No dedicated wallet endpoint** — only embedded on `/customer/{id}`. Filing the integer balance as a first-class model field would be ideal; today we have to pull the whole 60-field customer row.
- **`GET /order/export` is undocumented** — returns `.xlsx` with no filter params. Probably exports everything, which could be slow at scale. No param combinations tested; treat as "happy path only".
- **Webhook registration creates duplicates silently** — there's no idempotency. We have two live `order.created` subs right now (ids 11244 + 11245) from re-hitting the register button. Fix via M5.
- **`service.code` vs `serviceCompany.companyCode` nomenclature** — the phrase "service code" is overloaded. The bookable identifier is `service.code` (e.g. `SPXDMY-PN-BD1`), not the brand's `companyCode` (e.g. `SPXDMY`). The skill doc drafted earlier confused these; fixed this session. Any stored enabled-services values from before today may be brand codes; `quoteRatesForOrder` now matches either, so no data migration is needed.
- **No `postcode`/`state` lookup API** — postcode-to-state validation has to be done client-side or via a separate MY-specific library. Delyva only validates on quote.
- **`subscription` / `planName` is `null` on our account** — the "DelyvaNow+" plan mentioned in skill docs is opt-in and we're not on it. Plan-tier features like white-label map are unavailable until that upgrade.
- **Status-code semantics not in docs** — the integer `statusCode` values (90, 100, 110, 200, 300, 400, 500) are guessed from observation; Delyva has no public table. Treat as opaque beyond the documented cutoffs.
- **COD/insurance types exist in our `CreateOrderInput` today but never exercised** — verification of the exact payload shape (`cod: {currency, amount}` vs nested addon) should happen in a sandbox before shipping H3.

---

*End of audit. Commit hash for the accompanying bug fix: see `fix(delyva): defensive parsing of instantQuote services`.*
