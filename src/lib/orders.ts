/**
 * Order domain helpers — pure functions, no I/O.
 *
 * Status transition graph and order number formatting live here so server
 * actions, admin UI, and tests all agree on the exact rules (D3-12).
 *
 * NOTE: The OrderStatus string-literal union here MUST stay in sync with
 * `orderStatusValues` in `src/lib/db/schema.ts` and `orderStatusEnum`
 * in `src/lib/validators.ts`. All three are the same six strings.
 */

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

/**
 * Status transition graph per D3-12. Admin can only advance orders through
 * these transitions; backwards moves and skipped states are rejected at the
 * server action layer via `assertValidTransition()`.
 *
 *   pending    -> paid | cancelled
 *   paid       -> processing | cancelled
 *   processing -> shipped | cancelled
 *   shipped    -> delivered
 *   delivered  -> (terminal)
 *   cancelled  -> (terminal)
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/**
 * Returns the set of statuses that may follow `from`. Terminal statuses
 * (delivered, cancelled) return an empty array.
 */
export function nextAllowedStatuses(from: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_FLOW[from] ?? [];
}

/**
 * Throws if `from -> to` is not an allowed transition. Call this BEFORE
 * every status write — including from the webhook handler and admin action.
 */
export function assertValidTransition(
  from: OrderStatus,
  to: OrderStatus,
): void {
  const allowed = nextAllowedStatuses(from);
  if (!allowed.includes(to)) {
    throw new Error(`Invalid status transition: ${from} -> ${to}`);
  }
}

/**
 * Converts a UUIDv4 (with or without dashes) to a user-facing order number
 * of the form `PN-XXXXXXXX` where XXXXXXXX is the last 8 hex characters of
 * the UUID, uppercased, with dashes stripped BEFORE slicing.
 *
 * Example:
 *   "7f3a2b91-1234-5678-9abc-def012345678"
 *     -> strip dashes -> "7f3a2b91123456789abcdef012345678"
 *     -> last 8 hex   -> "12345678"
 *     -> uppercase    -> "12345678"
 *     -> final        -> "PN-12345678"
 *
 * The result is NOT unique on its own for short spans (collisions are
 * cosmetic — the underlying UUID is still the primary key), but is
 * human-readable enough for support/shipping labels.
 */
export function formatOrderNumber(id: string): string {
  const hex = id.replace(/-/g, "");
  const tail = hex.slice(-8).toUpperCase();
  return `PN-${tail}`;
}
