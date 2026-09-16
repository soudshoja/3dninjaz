# Delyva delivered-detection + idempotent notification fix

Branch: `fix/delyva-delivered-detection` (from `origin/master`)

## Context

Delyva webhook subscriptions were fixed to point at prod on 2026-09-16, so
`order_tracking.update` / `order_tracking.change` events now reach
`src/app/api/webhooks/delyva/route.ts`. Two defects in the handler must be
fixed before that traffic can be trusted:

1. Delivered detection relies on a text regex that Delyva never sends
   (`status` is always the literal string `"ready"`); the numeric fallback
   is gated on an unreachable condition. Result: delivered detection can
   never fire.
2. Both `order_tracking.update` (fires on every scan) and
   `order_tracking.change` (fires only on statusCode change) are
   subscribed. Once a parcel reaches statusCode 700, further `update`
   events keep re-arriving at 700 and the current code would resend the
   "delivered" email/WhatsApp every time. Not idempotent.

Verified Delyva statusCode facts (do not re-derive):
- 700 = delivered (terminal)
- 900 = cancelled
- 110 = label printed
- 0/100/500/600 = not authoritatively documented (SPX uses 500 for
  in-transit despite docs claiming otherwise) — no customer-facing
  behaviour keyed off these codes.

## Tasks

1. **Add pure decision helper module** `src/lib/delyva-delivery-status.ts`
   - `isDeliveredStatusCode(statusCode)` → `statusCode >= 700 && statusCode !== 900`.
   - `isCancelledStatusCode(statusCode)` → `statusCode === 900`.
   - `shouldNotifyDelivered({ statusCode, currentOrderStatus })` → true only
     when `isDeliveredStatusCode(statusCode)` AND `currentOrderStatus !==
     "delivered"`.
   - Guard non-number / null / undefined statusCode → false.
   - Acceptance: pure functions, no DB/IO imports, fully unit-testable.

2. **Add vitest suite** `src/lib/delyva-delivery-status.test.ts`
   - `isDeliveredStatusCode`: 700 → true, 900 → false, 699 → false, 110 →
     false, non-number/undefined → false.
   - `isCancelledStatusCode`: 900 → true, 700 → false.
   - `shouldNotifyDelivered`: statusCode 700 + currentOrderStatus
     "delivered" → false (idempotency case); statusCode 700 +
     currentOrderStatus "shipped" → true; statusCode 900 + any status →
     false.
   - Acceptance: `npx vitest run src/lib/delyva-delivery-status.test.ts`
     passes.

3. **Rewire the webhook handler** `src/app/api/webhooks/delyva/route.ts`
   - Delete the text-regex `looksDelivered` block and its comment.
   - Import `isDeliveredStatusCode`, `isCancelledStatusCode`,
     `shouldNotifyDelivered` from the new lib module.
   - After the unconditional `orderShipments` update (unchanged — shipment
     row's `statusCode`/message always gets written regardless of value):
     - If `isCancelledStatusCode(data.statusCode)`: `console.warn` a log
       line noting the shipment was cancelled at Delyva; do NOT touch
       `orders.status`.
     - If `isDeliveredStatusCode(data.statusCode)`: look up the shipment →
       order (existing query shape), **select `status` too**, then call
       `shouldNotifyDelivered({ statusCode: data.statusCode,
       currentOrderStatus: order.status })`. Only when true: update
       `orders.status = "delivered"`, fire `sendOrderDeliveredEmail` and
       `sendWhatsAppNotification("order_delivered", ...)` (both already
       fire-and-forget via `void ... .catch(...)` — keep that shape so the
       response is not held up).
   - Keep the handler returning `NextResponse.json({ ok: true })` promptly;
     no new synchronous awaits on email/WhatsApp sends.
   - Do not touch the HMAC verification code path.
   - Acceptance: repeat 700 event on an already-`delivered` order produces
     no `orders` UPDATE and no notification calls (verified via the unit
     tests on the extracted helper + manual code read of the call site).

4. **Verify**
   - `npx tsc --noEmit` — must pass with zero new errors.
   - `npx vitest run` — new suite passes; the 1 pre-existing failing test +
     3 pre-existing failing suites (`config-fields` /
     `configurator-*`) remain failing and untouched (do not fix, do not
     regress further).

5. **Commit**
   - Atomic commits per logical step (helper+tests as one or two commits,
     route rewire as its own commit).
   - Trailer on every commit exactly as specified by the task instructions.
   - No push, no PR — stop after local commits on
     `fix/delyva-delivered-detection`.

## Out of scope

- HMAC/signature verification behaviour.
- Adding behaviour for statusCodes 0/100/500/600.
- Auto-cancelling orders on statusCode 900.
- Fixing the 4 pre-existing failing test files.
