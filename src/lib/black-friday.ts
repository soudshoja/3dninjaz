/**
 * Black Friday 2026: 15% off everything with a coupon code.
 *
 * The strip is shown as a teaser before the sale opens and through the sale,
 * then hides itself. The discount itself is the coupon in Admin > Coupons
 * (same code, same dates): nothing here changes prices.
 */
export const BLACK_FRIDAY = {
  code: "BLACKFRIDAY",
  /** Fri 27 Nov 2026, 8:00pm Malaysia time */
  startsAt: Date.parse("2026-11-27T20:00:00+08:00"),
  /** Saturday midnight = end of Sat 28 Nov 2026, Malaysia time */
  endsAt: Date.parse("2026-11-29T00:00:00+08:00"),
} as const;

/** True until the sale has ended (covers the teaser period and the sale). */
export function isBlackFridayOn(now: number = Date.now()): boolean {
  return now < BLACK_FRIDAY.endsAt;
}
