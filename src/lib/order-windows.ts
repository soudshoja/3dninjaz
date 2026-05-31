// Cancel / return eligibility windows. Pure constants — no side effects.
// Lives in /lib (not /actions) so it can be imported from any side server or
// client without violating the "use server" file-only-async-functions rule.

/**
 * 260601-afs — return window changed to 3 days from delivery.
 * Counted from orders.updatedAt at the delivered transition.
 */
export const RETURN_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 260601-afs — ship-by window: 3 days from approvedAt.
 * After approval, the customer must submit courier + tracking within this window.
 * Expiry is evaluated lazily on the next list/detail read (no cron needed).
 */
export const SHIP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Helper: returns true when an approved return request has exceeded its ship-by
 * window and the customer has not yet submitted tracking.
 */
export function isReturnShipExpired(req: {
  status: string;
  approvedAt: Date | null;
  shippedAt: Date | null;
}): boolean {
  return (
    req.status === "approved" &&
    req.approvedAt !== null &&
    req.shippedAt === null &&
    Date.now() > new Date(req.approvedAt).getTime() + SHIP_WINDOW_MS
  );
}
