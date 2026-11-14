/**
 * Dashboard analytics primitives. Pure helpers (no DB): bucketing paid orders
 * into a gap-free revenue series on the Malaysia calendar.
 *
 * The range model lives in src/lib/date-range.ts; the paid-order filter and
 * sales definition live in src/lib/paid-orders.ts.
 */

import {
  type ResolvedRange,
  type RangeBucket,
  bucketKeyForInstant,
  bucketLabel,
  enumerateBuckets,
  mytYmd,
} from "@/lib/date-range";
import type { PaidOrderRow } from "@/lib/paid-orders";
import { productSalesOf } from "@/lib/accounting-math";

export type RevenuePoint = {
  /** Bucket key: YYYY-MM-DD (day), Monday (week) or YYYY-MM-01 (month). */
  day: string;
  label: string;
  /** Product sales excluding shipping, net of refunds. */
  revenue: number;
};

/**
 * One point per bucket from the range start to its end, zero-filled. For an
 * unbounded start ("All time") the series begins at the first paid order.
 */
export function buildRevenueSeries(
  orders: Pick<PaidOrderRow, "createdAt" | "amountPaid" | "refunded" | "shipping">[],
  range: ResolvedRange,
  now: Date = new Date(),
): { bucket: RangeBucket; points: RevenuePoint[] } {
  const bucket = range.bucket;
  const today = mytYmd(now);
  const sums = new Map<string, number>();
  let earliest: string | null = null;
  for (const o of orders) {
    const key = bucketKeyForInstant(o.createdAt, bucket);
    sums.set(key, (sums.get(key) ?? 0) + productSalesOf(o));
    const day = mytYmd(o.createdAt);
    if (earliest == null || day < earliest) earliest = day;
  }
  const from = range.from ?? earliest ?? today;
  const to = range.to ?? today;
  const keys = enumerateBuckets(from <= to ? from : to, to, bucket);
  return {
    bucket,
    points: keys.map((k) => ({
      day: k,
      label: bucketLabel(k, bucket),
      revenue: Math.round((sums.get(k) ?? 0) * 100) / 100,
    })),
  };
}
