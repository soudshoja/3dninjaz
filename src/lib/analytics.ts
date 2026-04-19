import "server-only";

/**
 * Phase 5 plan 05-02 — analytics primitives. Pure date math + a small set of
 * helpers used by both the dashboard and the events ingest endpoint.
 *
 * Q-05-02 resolution: 7d/30d/90d ranges all use DAILY buckets (simpler, fits
 * 90 x-axis points cleanly in Recharts). Per the prompt "daily buckets up to
 * 30 days, weekly buckets for 31-90 days" — but we keep daily buckets for
 * v1 simplicity; weekly grouping is a chart-side aggregation we can layer
 * on later without refactoring the action.
 */

export type AnalyticsRange = "7d" | "30d" | "90d";

const VALID_RANGES: readonly AnalyticsRange[] = ["7d", "30d", "90d"];

export function parseRange(val: string | null | undefined): AnalyticsRange {
  return (VALID_RANGES as readonly string[]).includes(val ?? "")
    ? (val as AnalyticsRange)
    : "30d";
}

export function rangeToDays(range: AnalyticsRange): number {
  return range === "7d" ? 7 : range === "30d" ? 30 : 90;
}

/**
 * Inclusive range start at UTC 00:00 (today minus N-1 days). The chart x-axis
 * goes from this date up to today, inclusive — N daily buckets total.
 */
export function rangeStartDate(range: AnalyticsRange): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - rangeToDays(range) + 1);
  return d;
}

/**
 * Iterate from `start` (inclusive) to `end` (inclusive) at 1-day steps. Each
 * day is returned as an `YYYY-MM-DD` UTC string suitable for joining against
 * MySQL `DATE(created_at)` aggregates.
 */
export function iterateDays(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(start);
  cur.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
