# Phase 12 — Email System (12 Templates + Newsletter Subscribers)

**Status:** COMPLETE  
**Completed:** 2026-04-20 to 2026-04-21  
**Session:** 2026-04-20 to 2026-04-21

## Goal

Expand transactional email templates from 2 to 12; add newsletter subscriber signup in footer with GDPR-style unsubscribe; add admin subscriber management with CSV export.

## What Shipped

| Commit | Description |
|--------|-------------|
| `abe3479` | DB — `email_subscribers` table (Phase 12 schema) |
| `ed6a686` | Footer newsletter form + `/api/subscribe` endpoint |
| `28b8a1e` | Admin subscribers list + filter + CSV export + admin unsubscribe override |
| `bceb501` | Public `/api/unsubscribe` token flow + `/unsubscribed` confirmation page |
| `faafe56` | Expand email templates from 2 → 12 + lifecycle wiring |

## 12 Email Templates

1. `order_confirmation` — customer order confirmation
2. `order_shipped` — shipping notification with tracking link
3. `order_delivered` — delivery confirmation
4. `order_cancelled` — cancellation notice
5. `payment_received` — payment acknowledgement
6. `payment_failed` — payment failure notice
7. `refund_issued` — refund confirmation with amount
8. `password_reset` — password reset link (existing — migrated to template)
9. `welcome` — post-registration welcome
10. `newsletter_welcome` — subscriber welcome after signup
11. `review_request` — post-delivery review invitation
12. `admin_new_order` — admin notification on new order

## Key Decisions

- **Unsubscribe token** — 32-byte hex token stored in `email_subscribers.unsubscribe_token`; one-click unsubscribe at `/api/unsubscribe?token=<hex>`.
- **Admin override** — admin can mark any subscriber as unsubscribed from `/admin/subscribers` list.
- **CSV export** — active subscribers only; columns: email, subscribed_at.
- **Lifecycle wiring** — `order_shipped`, `order_delivered`, `payment_received` triggered from order status transition server actions.
- **`order_cancelled`** — template exists but send trigger deferred (no admin cancel flow yet; cancel comes from customer request flow in Phase 6).

## Known Deferred

- `order_cancelled` send trigger — admin cancel action not yet built; template ready when feature lands.
- `review_request` send trigger — scheduled send 3 days post-delivery not yet implemented (cron task).
- Newsletter broadcast UI — admin compose + send to all subscribers not in scope for v1.
