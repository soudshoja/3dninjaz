// ============================================================================
// Delyva delivered/cancelled status-code decisions — pure, no DB/IO.
//
// Verified against the live Delyva account 2026-09-16 (do not re-derive):
//   - Delyva's `status` / `statusText` / `statusMessage` text fields are the
//     literal string "ready" at EVERY stage (label printed, in transit,
//     delivered) — they carry no delivered signal. The only stage with its
//     own distinct word is cancellation ("cancelled"), but we still key off
//     the numeric code below for consistency and because text is not
//     guaranteed to remain "cancelled" forever.
//   - statusCode 110 = label printed.
//   - statusCode 700 = delivered (terminal).
//   - statusCode 900 = cancelled.
//   - statusCodes 0 / 100 / 500 / 600 are NOT authoritatively documented —
//     Delyva's public docs are provably wrong about 500 (SPX uses it for
//     in-transit, not what the docs claim). Do not add customer-facing
//     behaviour keyed off these codes.
//
// Detection must be numeric-only. Do not resurrect a text-regex fallback.
// ============================================================================

const DELYVA_DELIVERED_THRESHOLD = 700;
const DELYVA_CANCELLED_STATUS_CODE = 900;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * True when the incoming statusCode represents a delivered parcel.
 * 700+ is delivered EXCEPT 900, which is the distinct "cancelled" terminal
 * code (also >= 700 numerically, but must never be treated as delivered).
 */
export function isDeliveredStatusCode(statusCode: number | null | undefined): boolean {
  if (!isFiniteNumber(statusCode)) return false;
  return statusCode >= DELYVA_DELIVERED_THRESHOLD && statusCode !== DELYVA_CANCELLED_STATUS_CODE;
}

/** True when the incoming statusCode represents a cancelled shipment. */
export function isCancelledStatusCode(statusCode: number | null | undefined): boolean {
  if (!isFiniteNumber(statusCode)) return false;
  return statusCode === DELYVA_CANCELLED_STATUS_CODE;
}

/**
 * Idempotency gate for the "order delivered" customer notification
 * (email + WhatsApp) and the orders.status = "delivered" write.
 *
 * `order_tracking.update` fires on every tracking scan, so once a parcel
 * reaches statusCode 700 further `update` events keep re-arriving at 700.
 * Only notify/update the order the FIRST time — a repeat delivered event
 * on an order that is already `delivered` must be a silent no-op.
 */
export function shouldNotifyDelivered(params: {
  statusCode: number | null | undefined;
  currentOrderStatus: string | null | undefined;
}): boolean {
  return (
    isDeliveredStatusCode(params.statusCode) && params.currentOrderStatus !== "delivered"
  );
}
