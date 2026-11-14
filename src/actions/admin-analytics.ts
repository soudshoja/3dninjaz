"use server";

import { db } from "@/lib/db";
import { orders, orderItems, session, events } from "@/lib/db/schema";
import { and, gte, lt, sql, count, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveRange, type RangeParams, type RangeBucket } from "@/lib/date-range";
import { buildRevenueSeries, type RevenuePoint } from "@/lib/analytics";
import {
  paidOrderConditions,
  fetchPaidOrders,
  orderProductSales,
  orderReceipts,
} from "@/lib/paid-orders";

// ============================================================================
// Admin dashboard analytics aggregation.
//
// IMPORTANT (T-05-02-EoP / CVE-2025-29927):
// requireAdmin() FIRST in every export. Numbers are derived from DB rows; the
// client never supplies the figure we display.
//
// Accounting v2: the dashboard uses the SAME paid-order filter and Malaysia
// (UTC+8) day boundaries as the accounting pages (src/lib/paid-orders.ts):
//   paid order = amount_paid > 0
//   sales      = amount_paid - refunded_amount - shipping_cost  (ex shipping)
//   receipts   = amount_paid - refunded_amount                  (incl. shipping)
// Both bounds of the range apply to every query, including sessions and events.
// ============================================================================

export type AnalyticsTopProduct = {
  productId: string;
  productName: string;
  totalRevenue: number;
  totalQuantity: number;
};

export type AnalyticsResult = {
  /** Resolved range echoed back (preset or custom, MYT day strings). */
  range: {
    preset: string;
    from: string | null;
    to: string | null;
    label: string;
    days: number | null;
  };
  bucket: RangeBucket;
  /** Product sales excluding shipping, net of refunds. */
  revenue: number;
  /** Receipts including shipping, net of refunds. */
  receipts: number;
  orderCount: number;
  chartData: RevenuePoint[];
  topProducts: AnalyticsTopProduct[];
  funnel: {
    visits: number;
    addToBag: number;
    checkoutStarted: number;
    paid: number;
  };
};

/** Bound a TIMESTAMP column to the resolved range (half-open). */
function tsConds(
  col: AnyMySqlColumn,
  r: { start: Date | null; endExclusive: Date | null },
): SQL[] {
  const conds: SQL[] = [];
  if (r.start) conds.push(gte(col, r.start));
  if (r.endExclusive) conds.push(lt(col, r.endExclusive));
  return conds;
}

/**
 * Dashboard aggregates for ?range=<preset> or ?from=&to= (default 30 days).
 */
export async function getAnalytics(params: RangeParams): Promise<AnalyticsResult> {
  await requireAdmin();
  const r = resolveRange(params, { defaultPreset: "30d" });

  // 1) Paid orders in range (single shared fetch drives totals + chart).
  const paid = await fetchPaidOrders(r);
  let revenue = 0;
  let receipts = 0;
  for (const o of paid) {
    revenue += orderProductSales(o);
    receipts += orderReceipts(o);
  }
  const paidCount = paid.length;
  const series = buildRevenueSeries(paid, r);

  // 2) Top products by line total (line totals exclude shipping by nature).
  const topProductsRaw = await db
    .select({
      productId: orderItems.productId,
      productName: orderItems.productName,
      totalRevenue: sql<string>`COALESCE(SUM(${orderItems.lineTotal}), 0)`,
      totalQuantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
    .where(and(...paidOrderConditions(r)))
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(sql`SUM(${orderItems.lineTotal}) DESC`)
    .limit(5);

  const topProducts: AnalyticsTopProduct[] = topProductsRaw.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    totalRevenue: parseFloat(row.totalRevenue),
    totalQuantity: Number(row.totalQuantity),
  }));

  // 3) Funnel
  //    - visits: distinct user_ids in `session` rows created in range. An
  //      anonymous visitor with no session row is not counted (undercount).
  //    - addToBag / checkoutStarted: events table. checkoutStarted falls back
  //      to the count of all orders in range when no events are instrumented.
  const [visitsRow] = await db
    .select({ c: sql<number>`COUNT(DISTINCT ${session.userId})` })
    .from(session)
    .where(and(...tsConds(session.createdAt, r)));
  const visits = Number(visitsRow?.c ?? 0);

  const [addToBagRow] = await db
    .select({ c: count() })
    .from(events)
    .where(and(...tsConds(events.createdAt, r), sql`${events.event} = 'add_to_bag'`));
  const addToBag = Number(addToBagRow?.c ?? 0);

  const [checkoutStartedEventRow] = await db
    .select({ c: count() })
    .from(events)
    .where(and(...tsConds(events.createdAt, r), sql`${events.event} = 'checkout_started'`));
  let checkoutStarted = Number(checkoutStartedEventRow?.c ?? 0);

  if (checkoutStarted === 0) {
    const [allOrdersRow] = await db
      .select({ c: count() })
      .from(orders)
      .where(and(...tsConds(orders.createdAt, r)));
    checkoutStarted = Number(allOrdersRow?.c ?? 0);
  }

  return {
    range: { preset: r.preset, from: r.from, to: r.to, label: r.label, days: r.days },
    bucket: series.bucket,
    revenue: Math.round(revenue * 100) / 100,
    receipts: Math.round(receipts * 100) / 100,
    orderCount: paidCount,
    chartData: series.points,
    topProducts,
    funnel: { visits, addToBag, checkoutStarted, paid: paidCount },
  };
}
