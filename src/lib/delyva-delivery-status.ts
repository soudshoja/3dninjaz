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
 * Order statuses from which a Delyva delivered signal may flip an order to
 * "delivered". A booked parcel implies the order is being fulfilled:
 *   - shipped    the normal case.
 *   - processing admin booked the courier but has not yet clicked "shipped".
 *   - paid       payment confirmed, parcel booked and delivered, admin never
 *                advanced the status. The goods ARE delivered.
 * NEVER allowed: cancelled (would resurrect a dead order), pending /
 * awaiting_customer / awaiting_payment_review (unpaid — a parcel signal there
 * is anomalous and needs a human), and delivered itself (no-op).
 * (The enum has no refunded/returned state.)
 */
export const DELIVERABLE_SOURCE_STATUSES = ["paid", "processing", "shipped"] as const;

export function isDeliverableSourceStatus(status: string | null | undefined): boolean {
  return (
    typeof status === "string" &&
    (DELIVERABLE_SOURCE_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * Pure gate: is this delivered signal allowed to flip / notify the order?
 * True only for a delivered numeric code on an order in an allowed source
 * status. Already-delivered and cancelled orders are a silent no-op.
 */
export function shouldNotifyDelivered(params: {
  statusCode: number | null | undefined;
  currentOrderStatus: string | null | undefined;
}): boolean {
  return (
    isDeliveredStatusCode(params.statusCode) &&
    isDeliverableSourceStatus(params.currentOrderStatus)
  );
}
