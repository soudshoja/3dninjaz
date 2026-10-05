/**
 * Seasonal storefront switches. The Christmas entry in the Shop menu shows
 * itself between 1 Oct and 5 Jan (Malaysia time) so nobody has to remember to
 * turn it on or off. The /christmas page itself stays reachable all year.
 */
export const CHRISTMAS_CATEGORY_SLUG = "christmas";

export function isChristmasSeason(now: Date = new Date()): boolean {
  // Shift to MYT (UTC+8) so the switch flips at local midnight.
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const month = myt.getUTCMonth() + 1;
  const day = myt.getUTCDate();
  if (month >= 10) return true;
  if (month === 1) return day <= 5;
  return false;
}
