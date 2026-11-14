import "server-only";

import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { and, gte, lt, inArray, sql, type SQL } from "drizzle-orm";
import { toNum } from "@/lib/profit";
import { rangeBounds, type DateRange } from "@/lib/date-range";
import { productSalesOf, shippingKept } from "@/lib/accounting-math";

// ============================================================================
// ONE shared definition of "a paid order in range" for the dashboard
// analytics and every accounting view.
//
//   paid order   = orders.amount_paid > 0
//   range        = orders.created_at in [from 00:00 MYT, to+1day 00:00 MYT)
//   receipts     = amount_paid - refunded_amount            (incl. shipping)
//   product sales= receipts - shipping KEPT, where shipping kept is
//                  min(shipping_cost, max(0, receipts)). A fully refunded or
//                  part-paid order never held the whole shipping charge, so
//                  sales never go negative (receipts = sales + shipping kept).
//
// Shipping is a pass-through: the customer pays it, the courier gets it, so it
// is never revenue and never cost.
//
// Timestamps: Drizzle reads/writes TIMESTAMP columns as UTC, so comparing with
// real instants (MYT midnight expressed as a Date) is correct. Bucketing by day
// is done in JS from the Date (see date-range.ts), never with DATE() in SQL.
// ============================================================================

/** WHERE conditions for paid orders in a range. Spread into and(...). */
export function paidOrderConditions(range: DateRange): SQL[] {
  const conds: SQL[] = [sql`CAST(${orders.amountPaid} AS DECIMAL(12,2)) > 0`];
  const { start, endExclusive } = rangeBounds(range);
  if (start) conds.push(gte(orders.createdAt, start));
  if (endExclusive) conds.push(lt(orders.createdAt, endExclusive));
  return conds;
}

export type PaidOrderRow = {
  id: string;
  createdAt: Date;
  amountPaid: number;
  refunded: number;
  shipping: number;
  paypalFee: number | null;
  paypalNet: number | null;
  paypalCaptureId: string | null;
  extraCost: number;
  paymentMethod: string | null;
};

/** Receipts incl. shipping, net of refunds. */
export function orderReceipts(o: Pick<PaidOrderRow, "amountPaid" | "refunded">): number {
  return o.amountPaid - o.refunded;
}

/** Product sales: receipts minus shipping collected. */
export function orderProductSales(
  o: Pick<PaidOrderRow, "amountPaid" | "refunded" | "shipping">,
): number {
  return productSalesOf(o);
}

/** Shipping the shop kept (clamped to receipts). Pairs with orderProductSales. */
export function orderShippingKept(
  o: Pick<PaidOrderRow, "amountPaid" | "refunded" | "shipping">,
): number {
  return shippingKept(o);
}

export async function fetchPaidOrders(range: DateRange): Promise<PaidOrderRow[]> {
  const rows = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      amountPaid: orders.amountPaid,
      refunded: orders.refundedAmount,
      shipping: orders.shippingCost,
      paypalFee: orders.paypalFee,
      paypalNet: orders.paypalNet,
      paypalCaptureId: orders.paypalCaptureId,
      extraCost: orders.extraCost,
      paymentMethod: orders.paymentMethod,
    })
    .from(orders)
    .where(and(...paidOrderConditions(range)));

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    amountPaid: toNum(r.amountPaid),
    refunded: toNum(r.refunded),
    shipping: toNum(r.shipping),
    paypalFee: r.paypalFee == null ? null : toNum(r.paypalFee),
    paypalNet: r.paypalNet == null ? null : toNum(r.paypalNet),
    paypalCaptureId: r.paypalCaptureId,
    extraCost: toNum(r.extraCost),
    paymentMethod: r.paymentMethod,
  }));
}

export type PaidOrderItemRow = {
  orderId: string;
  quantity: number;
  unitCost: number | null;
};

/** Order lines for a set of orders (chunked IN lists; MariaDB-safe). */
export async function fetchOrderLines(orderIds: string[]): Promise<PaidOrderItemRow[]> {
  const out: PaidOrderItemRow[] = [];
  for (let i = 0; i < orderIds.length; i += 500) {
    const chunk = orderIds.slice(i, i + 500);
    const rows = await db
      .select({
        orderId: orderItems.orderId,
        quantity: orderItems.quantity,
        unitCost: orderItems.unitCost,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, chunk));
    for (const r of rows) {
      out.push({
        orderId: r.orderId,
        quantity: r.quantity ?? 0,
        unitCost: r.unitCost == null ? null : toNum(r.unitCost),
      });
    }
  }
  return out;
}
