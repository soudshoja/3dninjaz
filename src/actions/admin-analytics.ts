"use server";

import { db } from "@/lib/db";
import { orders, orderItems, session, events } from "@/lib/db/schema";
import { and, gte, inArray, sql, count } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  parseRange,
  rangeStartDate,
  iterateDays,
  type AnalyticsRange,
} from "@/lib/analytics";
import { computeOrderCost, toNum, toNumOrNull } from "@/lib/profit";

// ============================================================================
// Plan 05-02 admin analytics aggregation.
//
// IMPORTANT (T-05-02-EoP / CVE-2025-29927):
// requireAdmin() FIRST in every export. Revenue is derived from DB aggregates;
// the client never supplies the number we display.
//
// IMPORTANT (Q-05-02 resolution):
// Revenue counts orders with status IN (paid, processing, shipped, delivered)
// — pending and cancelled excluded. totalAmount is already POST-discount
// (Plan 05-03 writes the discounted total to orders.totalAmount), so the
// number on the dashboard is gross merchandise value net of coupon use.
// ============================================================================

const REVENUE_STATUSES = ["paid", "processing", "shipped", "delivered"] as const;

export type AnalyticsTopProduct = {
  productId: string;
  productName: string;
  totalRevenue: number;
  totalQuantity: number;
};

export type AnalyticsResult = {
  range: AnalyticsRange;
  revenue: number;
  orderCount: number;
  chartData: Array<{ day: string; revenue: number }>;
  topProducts: AnalyticsTopProduct[];
  funnel: {
    visits: number;
    addToBag: number;
    checkoutStarted: number;
    paid: number;
  };
};

export async function getAnalytics(
  range: AnalyticsRange,
): Promise<AnalyticsResult> {
  await requireAdmin();
  const start = rangeStartDate(range);

  // 1) Revenue total + paid order count
  const totals = await db
    .select({
      revenue: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      orderCount: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, REVENUE_STATUSES),
        gte(orders.createdAt, start),
      ),
    );
  const revenueStr = totals[0]?.revenue ?? "0";
  const paidCount = Number(totals[0]?.orderCount ?? 0);

  // 2) Revenue by day (raw groupby — fill missing days client-side below)
  const revenueByDay = await db
    .select({
      day: sql<string>`DATE(${orders.createdAt})`,
      revenue: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, REVENUE_STATUSES),
        gte(orders.createdAt, start),
      ),
    )
    .groupBy(sql`DATE(${orders.createdAt})`);

  const dayMap = new Map(
    revenueByDay.map((r) => [String(r.day), parseFloat(r.revenue)]),
  );
  const chartData = iterateDays(start, new Date()).map((day) => ({
    day,
    revenue: dayMap.get(day) ?? 0,
  }));

  // 3) Top products by line-total in range — innerJoin orders so we only count
  // qualifying revenue statuses.
  const topProductsRaw = await db
    .select({
      productId: orderItems.productId,
      productName: orderItems.productName,
      totalRevenue: sql<string>`COALESCE(SUM(${orderItems.lineTotal}), 0)`,
      totalQuantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
    .where(
      and(
        inArray(orders.status, REVENUE_STATUSES),
        gte(orders.createdAt, start),
      ),
    )
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(sql`SUM(${orderItems.lineTotal}) DESC`)
    .limit(5);

  const topProducts: AnalyticsTopProduct[] = topProductsRaw.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    totalRevenue: parseFloat(r.totalRevenue),
    totalQuantity: Number(r.totalQuantity),
  }));

  // 4) Funnel
  //    - visits: count of distinct user_ids in `session` rows created in range.
  //      An anonymous visitor who never logs in does NOT have a session row,
  //      so this undercounts true visits — see events table for true page_view
  //      counts (instrumented opt-in by Plan 05-02 onClick wiring).
  //    - addToBag: events table, event = "add_to_bag"
  //    - checkoutStarted: events table, event = "checkout_started" — falls
  //      back to total order count if events table has zero rows in range
  //      (pre-instrumentation grace period)
  //    - paid: same as paidCount above
  const [visitsRow] = await db
    .select({ c: sql<number>`COUNT(DISTINCT ${session.userId})` })
    .from(session)
    .where(gte(session.createdAt, start));
  const visits = Number(visitsRow?.c ?? 0);

  const [addToBagRow] = await db
    .select({ c: count() })
    .from(events)
    .where(
      and(gte(events.createdAt, start), sql`${events.event} = 'add_to_bag'`),
    );
  const addToBag = Number(addToBagRow?.c ?? 0);

  const [checkoutStartedEventRow] = await db
    .select({ c: count() })
    .from(events)
    .where(
      and(
        gte(events.createdAt, start),
        sql`${events.event} = 'checkout_started'`,
      ),
    );
  const checkoutStartedEvents = Number(checkoutStartedEventRow?.c ?? 0);

  // Backstop — if no events instrumented yet, fall back to orders count
  // (anything in orders, including pending). At least the operator sees
  // SOMETHING in the funnel before client onClick wiring lands.
  let checkoutStarted = checkoutStartedEvents;
  if (checkoutStartedEvents === 0) {
    const [allOrdersRow] = await db
      .select({ c: count() })
      .from(orders)
      .where(gte(orders.createdAt, start));
    checkoutStarted = Number(allOrdersRow?.c ?? 0);
  }

  return {
    range,
    revenue: parseFloat(String(revenueStr)),
    orderCount: paidCount,
    chartData,
    topProducts,
    funnel: {
      visits,
      addToBag,
      checkoutStarted,
      paid: paidCount,
    },
  };
}

/**
 * Convenience wrapper: parse the URL ?range= query and return the analytics
 * result. Used by the server-rendered /admin page.
 */
export async function getAnalyticsForRangeParam(
  rangeParam: string | null | undefined,
): Promise<AnalyticsResult> {
  const range = parseRange(rangeParam);
  return getAnalytics(range);
}

// ============================================================================
// Phase 10 (10-01) — "Profit this month" dashboard widget.
//
// Sums revenue, item cost, and extra cost across every order placed in the
// current calendar month whose status is one of REVENUE_STATUSES (same filter
// the revenue card uses — excludes pending + cancelled so unconfirmed/void
// orders don't inflate or deflate the number).
//
// Implementation note (MariaDB 10.11 — no LATERAL joins):
// Fetch qualifying order ids + extraCost first, then hydrate their
// orderItems in a single IN () query, then aggregate in JS via
// computeOrderCost. This matches the src/actions/products.ts pattern.
// ============================================================================

export type MonthlyProfitSummary = {
  monthStartISO: string;
  orderCount: number;
  revenue: number;
  itemCostTotal: number;
  extraCostTotal: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
  ordersMissingCost: number;
};

export async function getMonthlyProfitSummary(): Promise<MonthlyProfitSummary> {
  await requireAdmin();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // 1) Qualifying orders placed this calendar month.
  const orderRows = await db
    .select({
      id: orders.id,
      extraCost: orders.extraCost,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, REVENUE_STATUSES),
        gte(orders.createdAt, startOfMonth),
      ),
    );

  if (orderRows.length === 0) {
    return {
      monthStartISO: startOfMonth.toISOString(),
      orderCount: 0,
      revenue: 0,
      itemCostTotal: 0,
      extraCostTotal: 0,
      totalCost: 0,
      profit: 0,
      marginPercent: 0,
      ordersMissingCost: 0,
    };
  }

  const orderIds = orderRows.map((o) => o.id);

  // 2) All items belonging to those orders. MariaDB-safe inArray IN ().
  const itemRows = await db
    .select({
      orderId: orderItems.orderId,
      unitPrice: orderItems.unitPrice,
      unitCost: orderItems.unitCost,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  // 3) Bucket items by order id so computeOrderCost gets per-order input.
  const itemsByOrder = new Map<
    string,
    { price: number; qty: number; unitCost: number | null }[]
  >();
  for (const row of itemRows) {
    const bucket = itemsByOrder.get(row.orderId) ?? [];
    bucket.push({
      price: toNum(row.unitPrice),
      qty: row.quantity,
      unitCost: toNumOrNull(row.unitCost),
    });
    itemsByOrder.set(row.orderId, bucket);
  }

  // 4) Aggregate each order, sum into the monthly totals.
  let revenue = 0;
  let itemCostTotal = 0;
  let extraCostTotal = 0;
  let ordersMissingCost = 0;

  for (const o of orderRows) {
    const items = itemsByOrder.get(o.id) ?? [];
    const summary = computeOrderCost(items, toNum(o.extraCost));
    revenue += summary.revenueGross;
    itemCostTotal += summary.itemCostTotal;
    extraCostTotal += summary.extraCost;
    if (summary.hasMissingCosts) ordersMissingCost += 1;
  }

  const totalCost = itemCostTotal + extraCostTotal;
  const profit = revenue - totalCost;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;

  const round2 = (n: number) =>
    Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;

  return {
    monthStartISO: startOfMonth.toISOString(),
    orderCount: orderRows.length,
    revenue: round2(revenue),
    itemCostTotal: round2(itemCostTotal),
    extraCostTotal: round2(extraCostTotal),
    totalCost: round2(totalCost),
    profit: round2(profit),
    marginPercent: round2(marginPercent),
    ordersMissingCost,
  };
}
