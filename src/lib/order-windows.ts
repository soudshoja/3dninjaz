// Cancel / return eligibility windows. Pure constants — no side effects.
// Lives in /lib (not /actions) so it can be imported from any side server or
// client without violating the "use server" file-only-async-functions rule.

/** 14 days from delivery (Phase 6 Q-06-05). Counted from orders.updatedAt at the delivered transition. */
export const RETURN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
