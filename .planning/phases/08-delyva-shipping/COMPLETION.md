# Phase 08 — Delyva Shipping Integration

**Status:** COMPLETE  
**Completed:** 2026-04-20  
**Session:** 2026-04-20 to 2026-04-21

## Goal

Integrate Delyva courier platform: live rate quotes at checkout, admin books shipments + prints labels, HMAC-verified inbound webhooks, and origin/pricing admin config page.

## What Shipped

| Commit | Description |
|--------|-------------|
| `56f17ed` | DB schema — `shipping_config` + `order_shipments` tables + product shipping dims columns |
| `30a1dad` | Delyva server-only client wrapper with typed errors |
| `f5028cb` | `/admin/shipping` config page — origin address, pricing, enabled services |
| `80aaca9` | Admin orders — book courier + print label + track shipment flows |
| `65b2a66` | HMAC-verified webhook receiver with idempotency |
| `cfb72e8` | `quoteForCart` server action |
| `c234369` | Delyva live shipping-rate picker wired into `/checkout` |
| `6272653` | Register 4 webhook events against prod URL + fix endpoint path |
| `754e493` | Fix: defensive parsing of `instantQuote` services — handle flat `companyCode` |
| `a9d03b8` | Fix: guard 30kg parcel cap + document per-qty weight sum |
| `61df023` | `setsid` wrap in `start.sh` + dedupe Delyva webhooks |

## Key Decisions

- **Origin address** managed via `/admin/shipping` DB-backed config — no env var hardcoding.
- **4 webhook events** registered: `shipment.created`, `shipment.accepted`, `shipment.picked_up`, `shipment.delivered`.
- **30kg cap** enforced per parcel; multi-qty orders split across parcels in weight computation.
- **Idempotency** on webhook: `order_shipments.delyvaShipmentId` UNIQUE — duplicate events no-op.
- **`setsid` in start.sh** prevents Delyva webhook SIGPIPE killing the Node process when streaming response ends.

## Known Deferred Items

- Delyva capability audit documented in `.planning/delyva-capability-audit.md` — some edge-case couriers not supported via instant quote (fall back to manual booking).
- Label print is browser `window.open(labelUrl)` — no server-side PDF proxy in v1.

## Capability Audit

See `.planning/delyva-capability-audit.md` for full Delyva API surface vs what is used.
