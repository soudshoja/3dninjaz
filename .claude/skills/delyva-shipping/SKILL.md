---
name: delyva-shipping
description: Project-specific map of 3D Ninjaz's Delyva integration — code ↔ endpoint ↔ doc cross-ref, gotchas, and gap report as of 2026-04-24 cross-check. Use when the user mentions delyva, shipping, courier, instantQuote, rate, quote, booking, shipment, consignment, tracking, webhook, label, POSMY, Pos Laju, J&T, Ninja Van, SPX, GrabExpress, delyvax, or any fulfillment/last-mile logistics work for 3D Ninjaz. Pairs with global `delivery-skills` (raw Delyva reference) — this skill layers the 3D Ninjaz specifics (env vars, file paths, whitelist, bugs, TODOs).
---

# Delyva Shipping — 3D Ninjaz Integration

Caveman reference. Full Delyva API docs = global `delivery-skills` skill. Dis skill = 3D Ninjaz layer on top: where code lives, what hooked up, what not, what bug, what gap.

Cross-check date: **2026-04-24**. Docs source: `docs.api.delyva.com/?version=latest` (JS-rendered, scraping broken — rely on global skill's `references/endpoints.md` which was verified live 2026-04-20).

---

## Auth

| Thing | Value |
|---|---|
| Base URL (prod) | `https://api.delyva.app/v1.0` |
| Env | `DELYVA_BASE_URL` |
| Auth header | `X-Delyvax-Access-Token: <DELYVA_API_KEY>` |
| Merchant | `customerId=126795`, `companyCode="my"` |
| Webhook HMAC | `X-Delyvax-Hmac-Sha256` (base64) — key = account `apiSecret` from `GET /user` |
| Webhook event hdr | `X-Delyvax-Event` |

**Env vars used (all in `.env.local`):**
- `DELYVA_API_KEY` — per-account token
- `DELYVA_CUSTOMER_ID` — 126795
- `DELYVA_COMPANY_CODE` — `"my"`
- `DELYVA_BASE_URL` — fallback `https://api.delyva.app/v1.0`
- `DELYVA_WEBHOOK_SECRET` — canonical name (fallback `DELYVA_WEBHOOK_SHARED_SECRET`, `DELYVA_API_SECRET`). **Currently empty in prod** — Delyva UI has no HMAC field, webhooks arrive unsigned. Our receiver accepts unsigned when empty, strict HMAC when set.

**Never** import `src/lib/delyva.ts` from a client component. Key leaks.

---

## Endpoints — what docs ship ↔ what we use

| # | Method + path | Purpose | Our fn | Call sites | Status |
|---|---|---|---|---|---|
| 1 | `POST /service/instantQuote` | Rate quote | `delyvaApi.quote()` | `listDelyvaServices`, `quoteRatesForOrder`, `refreshServiceCatalog`, `quoteForCart` | **yes — full** |
| 2 | `POST /order` | Create draft | `delyvaApi.createDraft()` | `bookShipmentForOrder` | **yes — full** |
| 3 | `POST /order/{id}/process` | Dispatch draft | `delyvaApi.process()` | `bookShipmentForOrder` | **yes — full** |
| 4 | `GET /order/{id}` | Order details + tracking | `delyvaApi.getOrder()` + `getOrderFast()` (5s abort) | `bookShipmentForOrder`, `refreshShipmentStatus`, `hydrateTrackingView` | **yes — full** |
| 5 | `GET /order/{id}/label` | PDF label (binary) | `delyvaApi.label()` + proxy route | `src/app/api/admin/orders/[id]/label/route.ts` | **yes — single-id only** |
| 5b | `GET /order/{id1},{id2}/label` | **Batch labels** (CSV ids) | — | — | **no** (🟢 enhancement) |
| 5c | `GET /order/{id}/label?packingList=true` | Label + packing list | — | — | **no** (🟢 enhancement) |
| 6 | `POST /order/{id}/cancel` | Cancel (time-windowed) | `delyvaApi.cancel()` | `cancelShipment` | **yes — full** |
| 7 | `POST /webhook` | Register sub (body: `{event,url}`) | `delyvaApi.subscribeWebhook()` | `registerWebhooks` | **yes — partial** (see 🟡 below) |
| 8 | `GET /webhook` | List active subs | — | — | **no** (🔴 dup-risk — see below) |
| 9 | `DELETE /webhook/{id}` | Remove sub | — | — | **no** (🟢 enhancement) |
| 10 | `GET /user` | Account info + `apiSecret` | `delyvaApi.getUser()` | `testDelyvaConnection` | **yes — name/subscription only; `apiSecret` not pulled** |

Every other endpoint category documented by Delyva (customer CRUD, rate-card upload, merchant-child accounts) — **we don't use any**. Not needed for single-merchant B2C.

---

## Where stuff lives

| File | Purpose |
|---|---|
| `src/lib/delyva.ts` | Typed client wrapper, `delyvaApi` export, `parseQuoteServices`, `DelyvaError`, `getDelyvaWebhookSecret` |
| `src/lib/delyva-filter.ts` | Phase-15 `filterByEnabledCatalog` — shared admin + customer service filter |
| `src/lib/delyva-events.ts` | Plain module `DELYVA_EVENTS_TO_REGISTER = ["order.created", "order.failed", "order_tracking.change", "order_tracking.update"]` |
| `src/lib/shipping-config.ts` | `loadShippingConfig`, `resolveItemType` PACKAGE→PARCEL coercion |
| `src/lib/shipment-tracking.ts` | `buildTrackingView` — merges mirror row + live details for UI |
| `src/actions/shipping.ts` | Admin surface: config CRUD, `testDelyvaConnection`, `listDelyvaServices`, `registerWebhooks`, `quoteRatesForOrder`, `bookShipmentForOrder`, `cancelShipment`, `refreshShipmentStatus`, `refreshServiceCatalog`, `getServiceCatalog`, `updateServiceEnabled`, `updateCompanyEnabled`, `batchUpdateServiceEnabled`, `getAdminOrderTracking`, `getMyOrderTracking` |
| `src/actions/shipping-quote.ts` | Customer `quoteForCart` (20/60s rate-limited, variant-aware weight) |
| `src/app/api/webhooks/delyva/route.ts` | Webhook receiver — HMAC verify if secret set, else accept unsigned + warn; in-process idempotency cache |
| `src/app/api/admin/orders/[id]/label/route.ts` | Admin PDF label proxy |
| `src/components/admin/delyva-config-form.tsx` | `/admin/shipping/delyva` UI — test conn, list services, register webhooks, toggle catalog |

---

## The 9-step order lifecycle (how we use it)

1. **Quote on checkout** — `quoteForCart` → user picks rate. Service code stored on order row (`shippingServiceCode`).
2. **Payment** — PayPal capture.
3. **Admin opens `/admin/orders/[id]`** — sees paid order.
4. **Admin picks service** (optional re-quote via `quoteRatesForOrder`).
5. **Admin clicks Book** → `bookShipmentForOrder(orderId, serviceCode)`:
   a. `createDraft()` with `process:false`
   b. `process(draft.id, ...)` immediately (we skip review)
   c. `getOrder(draft.id)` to pull `consignmentNo` + `trackingNo`
   d. INSERT `order_shipments` row
   e. Fire-and-forget `sendOrderShippedEmail`
6. **Webhook updates** — `order_tracking.change`/`update` → mirror update + `order.delivered` email when `statusCode=400`.
7. **Admin prints label** — `/api/admin/orders/[id]/label` → streams PDF.
8. **Customer tracking** — `/orders/[id]` renders `ShipmentTrackingView` + iframe map if `consignmentNo` present and `statusCode<400`.
9. **Cancel** — `cancelShipment(orderId)` → `POST /order/{id}/cancel`.

---

## Enabled courier whitelist (12 total, 7 live, 5 pending)

Admin curated via `/admin/shipping/delyva`. See memory file `project_delyva_couriers.md` for full detail + idempotent reconcile SQL.

| Live? | company_code | Name |
|---|---|---|
| ✅ | NJVMY | Ninja Van |
| ✅ | NJVDMY | Ninja Van (DROP) |
| ✅ | JNTEMY | J&T Express |
| ✅ | JNTEDMY | J&T Express (DROP) |
| ✅ | SPXMY | SPX Express |
| ✅ | SPXDMY | SPX Express (DROP) |
| ✅ | CLEXMY | City Link Express |
| ⏳ | POSMY | Pos Laju (needs merchant activation — ticket open) |
| ⏳ | NJVMY-RS | Ninja Van MPS (reverse logistics) |
| ⏳ | NJVMY-INT | Ninja Van International |
| ⏳ | NJVDMY-INT | Ninja Van International (DROP) |
| ⏳ | SF-INT-GE | SF Express Global Express+ |

Filter path: `shipping_service_catalog.is_enabled` (Phase 15 table). Legacy fallback = `shipping_config.enabled_services` JSON col. Both honored by `filterByEnabledCatalog()`.

---

## Gotchas (apply automatically)

1. **`itemType` polymorphism** — `PACKAGE` routes to **Grab-only** (zero standard couriers). Coerced to `PARCEL` in `resolveItemType()`. Every call-site uses it. `DOCUMENT` returns same list as `PARCEL` (redundant probe — dropped from refresh). `BULKY` = zero services on most corridors.

2. **`companyCode` shape duality** — `services[].service.serviceCompany.companyCode` is the **nested canonical** field. Older/edge responses can surface a flat top-level `serviceCompany.companyCode`. Always use `parseQuoteServices()` — never destructure raw.

3. **`service.code` vs `serviceCompany.companyCode`** — Pass `service.code` (e.g. `"SPXDMY-PN-BD1"`) to `POST /order`. Passing `companyCode` alone = rejection. `companyCode` is for grouping/filtering only.

4. **30 kg single-parcel cap** — Delyva rejects over 30 kg. `quoteForCart` guards + returns friendly error. **`bookShipmentForOrder` does NOT guard** (🟡 risk — admin booking heavy orders bypasses the check). No multi-parcel split logic exists — CLAUDE.md says "Cap guard in `src/lib/delyva.ts`" but the guard is in `quoteForCart` only.

5. **`companyCode: "my"` in request** — required for our merchant account. Always sent via `delyvaApi.quote()` + `.createDraft()` auto-inject. Don't add to `ProcessInput` — not needed there.

6. **Response envelope** — prod wraps `{ data: ... }`. `unwrap()` in `delyva()` accepts both shapes.

7. **Label is `application/pdf` binary** — `delyva()` detects Content-Type and returns raw `Response`; caller must `.arrayBuffer()`. JSON parsing = corrupts the bytes.

8. **Webhook unsigned today** — Delyva UI has no HMAC secret field. Receiver accepts unsigned when `DELYVA_WEBHOOK_SECRET` is empty, logs warning. When/if Delyva exposes HMAC config, set the env var — receiver auto-enforces strict.

9. **Webhook idempotency** — in-process `SEEN_KEYS` Set keyed by `id:statusCode:timestamp`. For <100/day this is fine. DB-backed UNIQUE on `order_shipments.delyvaOrderId` (added today as R7 per task brief) adds a second layer.

10. **`scheduledAt` format** — we send `.toISOString()` (`...Z` UTC). Docs example shows `+0800` MY offset. Delyva accepts both in prod (verified April 2026).

11. **`cancel()` time windows** — NDD: `statusCode<110` (before pickup). Instant: `statusCode<200` (before in-transit). Out-of-window → DelyvaError; UI must surface "contact support".

12. **`getOrderFast()` 5s abort** — use in render paths that must not hang. Throws `DelyvaError("TIMEOUT")` on breach → fall back to mirror row. Standard `getOrder()` has no timeout.

---

## Response pitfalls

- `price.amount` — sometimes string, sometimes number. Cast: `Number(s.price?.amount ?? 0)`.
- `service.name` — can be absent. Fall back to `service.code` for display.
- `services[]` can contain `null` entries under rare corridor conditions. `parseQuoteServices` filters.
- `statusCode` enum (observed): `90`=cancelled, `100`=created, `110`=in-transit, `200`=processing, `300`=out-for-delivery, `400`=delivered, `500`=failed.
- Timestamps: webhook `timestamp` can be `+0800` offset OR `Z`. `new Date(payload.timestamp)` handles both.
- `waypoints`, `distance`, `duration`, `vehicleType`, `multiPcs`, `itemType` (array of allowed types) — **returned but we ignore**. Surface in admin UI if useful later.

---

## Integration map — endpoint → our fn

| Endpoint | Client method | Admin action | Customer action | UI file |
|---|---|---|---|---|
| `POST /service/instantQuote` | `delyvaApi.quote` | `listDelyvaServices`, `quoteRatesForOrder`, `refreshServiceCatalog` | `quoteForCart` | `admin/shipping/delyva`, checkout `shipping-rate-picker.tsx` |
| `POST /order` | `delyvaApi.createDraft` | `bookShipmentForOrder` (step 1) | — | admin order page `order-shipment-panel.tsx` |
| `POST /order/{id}/process` | `delyvaApi.process` | `bookShipmentForOrder` (step 2) | — | same |
| `GET /order/{id}` | `delyvaApi.getOrder` + `getOrderFast` | `refreshShipmentStatus`, `getAdminOrderTracking` | `getMyOrderTracking` | tracking widget |
| `GET /order/{id}/label` | `delyvaApi.label` | route proxy | — | `/api/admin/orders/[id]/label` |
| `POST /order/{id}/cancel` | `delyvaApi.cancel` | `cancelShipment` | — | admin order page |
| `POST /webhook` | `delyvaApi.subscribeWebhook` | `registerWebhooks` | — | `/admin/shipping/delyva` |
| `GET /webhook` | **missing** | — | — | — |
| `DELETE /webhook/{id}` | **missing** | — | — | — |
| `GET /user` | `delyvaApi.getUser` | `testDelyvaConnection` | — | same |

---

## Request examples (minimal MYR-domestic)

### Quote
```bash
curl -X POST https://api.delyva.app/v1.0/service/instantQuote \
  -H 'Content-Type: application/json' \
  -H "X-Delyvax-Access-Token: $DELYVA_API_KEY" \
  -d '{
    "customerId": 126795,
    "companyCode": "my",
    "origin":{"address1":"Unit 3-01","city":"Kuala Lumpur","state":"WP Kuala Lumpur","postcode":"50450","country":"MY"},
    "destination":{"address1":"","city":"Petaling Jaya","state":"Selangor","postcode":"47300","country":"MY"},
    "weight":{"unit":"kg","value":1},
    "itemType":"PARCEL"
  }'
```

### Create + process order
```bash
# 1. draft
curl -X POST https://api.delyva.app/v1.0/order \
  -H 'Content-Type: application/json' \
  -H "X-Delyvax-Access-Token: $DELYVA_API_KEY" \
  -d '{"customerId":126795,"companyCode":"my","process":false,"serviceCode":"SPXDMY-PN-BD1","source":"3d-ninjaz-web","referenceNo":"REF-ABC", ...}'
# saves draft.id = 9876543

# 2. process
curl -X POST https://api.delyva.app/v1.0/order/9876543/process \
  -H 'Content-Type: application/json' \
  -H "X-Delyvax-Access-Token: $DELYVA_API_KEY" \
  -d '{"serviceCode":"SPXDMY-PN-BD1","originScheduledAt":"2026-04-25T09:00:00Z","destinationScheduledAt":"2026-04-26T18:00:00Z"}'
```

### Get order / label / cancel
```bash
curl https://api.delyva.app/v1.0/order/9876543 -H "X-Delyvax-Access-Token: $DELYVA_API_KEY"
curl https://api.delyva.app/v1.0/order/9876543/label -H "X-Delyvax-Access-Token: $DELYVA_API_KEY" -o label.pdf
curl -X POST https://api.delyva.app/v1.0/order/9876543/cancel -H "X-Delyvax-Access-Token: $DELYVA_API_KEY" -d '{}'
```

### Webhook register / list / delete
```bash
curl -X POST https://api.delyva.app/v1.0/webhook \
  -H 'Content-Type: application/json' \
  -H "X-Delyvax-Access-Token: $DELYVA_API_KEY" \
  -d '{"event":"order_tracking.change","url":"https://app.3dninjaz.com/api/webhooks/delyva"}'
curl https://api.delyva.app/v1.0/webhook -H "X-Delyvax-Access-Token: $DELYVA_API_KEY"
curl -X DELETE https://api.delyva.app/v1.0/webhook/42 -H "X-Delyvax-Access-Token: $DELYVA_API_KEY"
```

---

## Gap report (2026-04-24 cross-check)

### 🔴 BLOCKER — fix soon

**B-1. No `GET /webhook` idempotency check in `registerWebhooks`**
Hitting the admin "Register Webhooks" button twice creates **duplicate subscriptions** at Delyva. Delyva will then deliver every event N× → our idempotency cache dedupes but wastes bandwidth + log noise. Fix: call `delyvaApi.listWebhooks()` first, skip any `(event, url)` pair already present. Pattern in `references/examples.md` §6.
- **Effort:** 10 min. Add `listWebhooks` + `deleteWebhook` to `delyvaApi`, filter in `registerWebhooks`.
- **File:** `src/lib/delyva.ts`, `src/actions/shipping.ts::registerWebhooks`.

### 🟡 RISK — worth fixing this sprint

**R-1. Admin booking bypasses 30 kg guard**
`quoteForCart` rejects >30 kg; `bookShipmentForOrder` does not. Admin booking a heavy manually-entered order → Delyva rejects with opaque error mid-flow (after draft created). Fix: sum weight in `bookShipmentForOrder` before `createDraft()`, return friendly error same as `quoteForCart`.
- **Effort:** 15 min. Extract shared `assertUnder30kg(weight)` to `src/lib/shipping-config.ts`.

**R-2. `apiSecret` never fetched**
`getUser()` response contains `apiSecret` — the canonical HMAC signing key per docs. We don't persist it anywhere. When Delyva UI exposes HMAC, we'll need to either fetch via `getUser()` + store, or let admin paste it. Docs are clear: per-subscription shared secrets don't exist — it's the account-wide `apiSecret`.
- **Effort:** 5 min to expand `testDelyvaConnection` to surface it; TBD to actually use it.

**R-3. Dead `secret` parameter on `subscribeWebhook`**
`src/lib/delyva.ts::subscribeWebhook(event, url, _secret?)` accepts a secret that's never sent. Leftover from the incorrect older doc. Callers pass it (`registerWebhooks` passes `getDelyvaWebhookSecret()`). Confusing. Fix: drop the parameter entirely.
- **Effort:** 2 min.

**R-4. No `labelPdf + packingList` route**
Admin fulfillment wants one-page label + packing slip. Docs: `?packingList=true`. Currently label route hardcodes base path with no query. Fix: add optional query flag.
- **Effort:** 5 min.

### 🟢 ENHANCEMENT — future

**E-1. Batch label endpoint** — `/order/{id1},{id2}/label` for bulk fulfillment days. Saves N round-trips when shipping 10 orders. Wire a `/api/admin/labels/bulk?ids=...` route.

**E-2. COD + Insurance** — `cod`/`insurance` fields already typed in `CreateOrderInput` but no UI or caller uses them. 3D Ninjaz is PayPal-only (no COD) so COD is theoretical. Insurance worth adding when order value > MYR 200 (trivial flag + pass-through).

**E-3. Multi-parcel auto-split** — orders >30 kg currently hard-reject. CLAUDE.md hints at split logic but none exists. Strategy: chunk inventory into ≤30kg parcels, create N draft orders, link by parent order id. Non-trivial — UI needs to show "3 parcels shipping" to customer.

**E-4. Label thumbnail pre-fetch** — print label PDF → render thumbnail in admin order page. Requires `pdfjs-dist` or server-side rasterize. Nice-to-have.

**E-5. Webhook subscription list UI** — `/admin/shipping/delyva` currently shows the list of events we *intend* to register. Wire `delyvaApi.listWebhooks()` so admin sees what's actually live + delete button.

**E-6. `multiPcs`, `vehicleType`, `duration` surface** — quote response has them; we drop. Surface on admin re-quote panel ("2-day van, supports multi-piece").

**E-7. `proof` / POD image from webhook** — `data.proof` on `order_tracking.change` when delivered contains proof-of-delivery photo URL. Not stored. Strong UX for customer tracking page + dispute evidence.

**E-8. HMAC enforcement** — the moment Delyva UI exposes a secret field, set `DELYVA_WEBHOOK_SECRET` and receiver auto-flips to strict. Monitor via Delyva changelog.

---

## How to extend

Common asks + file targets:

| Ask | Files to touch | Pattern to copy |
|---|---|---|
| Add cancellation via customer self-service | `src/actions/shipping.ts::cancelShipment`, new route `/api/orders/[id]/cancel-shipment`, guard by `getSessionUser()+ownership` | `getMyOrderTracking` auth pattern |
| Add label batch endpoint | New route `/api/admin/labels/bulk/route.ts`, concat ids, reuse label fetch pattern | `src/app/api/admin/orders/[id]/label/route.ts` |
| Add COD | `CreateOrderInput.cod` already typed; wire UI toggle on admin order page; pass `serviceAddon:[{id:-1,value:"<myr>"}]` in quote | `src/components/admin/order-shipment-panel.tsx` |
| Add insurance | Same as COD but `id:-3` + `insurance` field on create order | same |
| Store `apiSecret` from `/user` | Expand `testDelyvaConnection` to return `apiSecret`, admin pastes into env OR store in `shipping_config` table | existing `testDelyvaConnection` flow |
| Unsubscribe all webhooks | Add `delyvaApi.listWebhooks` + `deleteWebhook`, iterate | global skill `references/examples.md` §6 |
| Register webhooks idempotent | Same primitives; filter before POST | same |
| Surface POD photo | Extend `DelyvaWebhookPayload.data.proof?: string`, persist to `order_shipments.proof_photo_url`, render on customer tracking | webhook receiver + `shipment-tracking.ts` |
| Weight guard admin booking | Shared `assertUnder30kg(items, fallback)` in `shipping-config.ts`, call from both `quoteForCart` + `bookShipmentForOrder` | existing `quoteForCart` 30kg block |

---

## What we got right (validated against docs)

- **Request envelope** — `{ customerId, companyCode, ...input }` auto-inject in client wrapper. Matches docs.
- **Defensive quote parser** — `parseQuoteServices` handles nested vs flat `serviceCompany`, null entries, missing codes. Covered all shapes docs show.
- **PDF handling** — Content-Type sniff → raw Response; no JSON parse. Correct.
- **HMAC verification** — SHA256 base64, `timingSafeEqual`, raw body (not parsed). Matches docs exactly.
- **Idempotency key** — `id:statusCode:timestamp`. Matches reco in `references/webhooks.md`.
- **Two-step draft→process** — letting payment settle + admin review. Correct design.
- **`serviceCode = service.code`** not `companyCode`. Common mistake avoided.
- **`itemType: PARCEL` coercion** — centralised `resolveItemType`. Delyva gotcha handled.
- **Timeout wrapper** — `getOrderFast(5000)` for render paths. Good defensive pattern.
- **Admin-gate first await** — CVE-2025-29927. Every server action complies.
- **Webhook UNIQUE on delyvaOrderId** — 2026-04-24 added (R7 in task).
- **Env var consolidation** — `getDelyvaWebhookSecret()` fallback chain. Zero-downtime renames.

---

## Sources

- Live Delyva docs: `https://docs.api.delyva.com/?version=latest` (JS-rendered; use browser for nav)
- Official dev guide: `https://delyva.com/my/blog/kb/developer-guide-to-integrating-with-delyva-api/`
- Global `delivery-skills` skill — `references/endpoints.md` (verified live 2026-04-20)
- Global `delivery-skills` skill — `references/webhooks.md` (HMAC + idempotency)
- Global `delivery-skills` skill — `references/examples.md` (E2E Next.js patterns)
- Memory file `~/.claude/projects/.../project_delyva_couriers.md` — 12-company whitelist + POSMY diag
- CLAUDE.md §Delyva shipping quirks
