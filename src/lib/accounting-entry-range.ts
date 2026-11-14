// Range helpers for the accounting entry pages and account-balances.
//
// The range MODEL (presets, URL parsing, MYT arithmetic) lives in
// date-range.ts and is shared with the dashboard and the core accounting
// pages. Pages resolve the URL with `resolveRange(sp, { defaultPreset: "all" })`
// and pass the result to the shared <DateRangePicker current={...}/>.
//
// This module is only the thin adapter the entry-side code needs:
//   - EntryRange        alias of DateRange (inclusive YYYY-MM-DD, null = open)
//   - nextDayYmd        exclusive upper bound for string-dated tables
//   - mytBounds         MYT instants [lo, hi) for timestamp columns
//   - describeRange     human label for the active range
// Pure module: no server imports, safe anywhere.

import {
  addDays,
  daysBetween,
  formatYmd,
  isValidYmd,
  rangeBounds,
  type DateRange,
} from "@/lib/date-range";

/** Inclusive YYYY-MM-DD bounds. null = unbounded. */
export type EntryRange = DateRange;

/** Longest span a server action will honour (about ten years). */
export const MAX_RANGE_DAYS = 3660;

/**
 * Server-side normalisation for a range that arrived from a client (server
 * actions are callable with any argument). Never trust the raw strings:
 *   - anything that is not a real YYYY-MM-DD becomes unbounded on that side
 *   - from > to is swapped
 *   - a span longer than MAX_RANGE_DAYS is clamped to the most recent window
 */
export function normalizeRange(
  input: { from?: unknown; to?: unknown } | null | undefined,
): EntryRange {
  const pick = (v: unknown): string | null =>
    typeof v === "string" && isValidYmd(v) ? v : null;
  let from = pick(input?.from);
  let to = pick(input?.to);
  if (from && to) {
    if (from > to) [from, to] = [to, from];
    if (daysBetween(from, to) > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
  }
  return { from, to };
}

/** "YYYY-MM-DD" -> next calendar day (exclusive upper bound for string dates). */
export function nextDayYmd(ymd: string): string {
  return addDays(ymd, 1);
}

/** MYT instants for timestamp columns: [lo, hi). Either may be null. */
export function mytBounds(range: EntryRange | null | undefined): {
  lo: Date | null;
  hi: Date | null;
} {
  const { start, endExclusive } = rangeBounds(range ?? { from: null, to: null });
  return { lo: start, hi: endExclusive };
}

/** Human label for the active range, e.g. "1 Nov 2026 to 14 Nov 2026" or "All time". */
export function describeRange(range: EntryRange): string {
  if (!range.from && !range.to) return "All time";
  if (range.from && range.to) return `${formatYmd(range.from)} to ${formatYmd(range.to)}`;
  if (range.from) return `From ${formatYmd(range.from)}`;
  return `Up to ${formatYmd(range.to as string)}`;
}
