/**
 * Black Friday 2026: 15% off everything with a coupon code.
 *
 * The strip is shown as a teaser before the sale opens and through the sale,
 * then hides itself. The discount itself is the coupon in Admin > Coupons
 * (same code, same dates): nothing here changes prices.
 */
export const BLACK_FRIDAY = {
  code: "BLACKFRIDAY",
  // Same window as the BLACKFRIDAY coupon in Admin > Coupons (stored in UTC
  // as 2026-11-26 12:00 to 2026-11-27 16:00). Keep the two in step.
  /** Thu 26 Nov 2026, 8:00pm Malaysia time */
  startsAt: Date.parse("2026-11-26T20:00:00+08:00"),
  /** Sat 28 Nov 2026, 12:00am Malaysia time (midnight after Friday) */
  endsAt: Date.parse("2026-11-28T00:00:00+08:00"),
  /** Shown next to the offer on wider screens. */
  when: "Thu 8:00pm till Sat 12:00am",
} as const;

/** True until the sale has ended (covers the teaser period and the sale). */
export function isBlackFridayOn(now: number = Date.now()): boolean {
  return now < BLACK_FRIDAY.endsAt;
}
