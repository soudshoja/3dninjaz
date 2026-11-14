import "server-only";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, desc } from "drizzle-orm";
import { toNum } from "@/lib/profit";
import type { DateRange } from "@/lib/date-range";
import {
  paidOrderConditions,
  fetchOrderLines,
  orderProductSales,
  orderShippingKept,
  orderReceipts,
} from "@/lib/paid-orders";
import { round2 } from "@/lib/accounting-math";

// Every paid order in a range, one row each. Uses the SAME paid-order filter
// and the SAME sales / shipping split as the sales report, so the rows of a
// period always add up to that period's line in the report.

export type SalesOrderRow = {
  id: string;
  createdAt: Date;
  status: string;
  source: "web" | "manual";
  customer: string;
  itemLabel: string | null;
  itemCount: number;
  sales: number;
  shipping: number;
  paypalFee: number | null;
  receipts: number;
  refunded: number;
};

export type SalesOrdersResult = {
  rows: SalesOrderRow[];
  totals: { orders: number; sales: number; shipping: number; paypalFees: number; receipts: number };
};

export async function getSalesOrders(range: DateRange): Promise<SalesOrdersResult> {
  const raw = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      status: orders.status,
      sourceType: orders.sourceType,
      shippingName: orders.shippingName,
      customItemName: orders.customItemName,
      amountPaid: orders.amountPaid,
      refunded: orders.refundedAmount,
      shipping: orders.shippingCost,
      paypalFee: orders.paypalFee,
    })
    .from(orders)
    .where(and(...paidOrderConditions(range)))
    .orderBy(desc(orders.createdAt));

  const lines = await fetchOrderLines(raw.map((r) => r.id));
  const qty = new Map<string, number>();
  for (const l of lines) qty.set(l.orderId, (qty.get(l.orderId) ?? 0) + l.quantity);

  const rows: SalesOrderRow[] = raw.map((r) => {
    const o = { amountPaid: toNum(r.amountPaid), refunded: toNum(r.refunded), shipping: toNum(r.shipping) };
    return {
      id: r.id,
      createdAt: r.createdAt,
      status: String(r.status),
      source: r.sourceType === "manual" ? "manual" : "web",
      customer: r.shippingName,
      itemLabel: r.customItemName ?? null,
      itemCount: qty.get(r.id) ?? 0,
      sales: round2(orderProductSales(o)),
      shipping: round2(orderShippingKept(o)),
      paypalFee: r.paypalFee == null ? null : round2(toNum(r.paypalFee)),
      receipts: round2(orderReceipts(o)),
      refunded: round2(o.refunded),
    };
  });

  return {
    rows,
    totals: {
      orders: rows.length,
      sales: round2(rows.reduce((a, r) => a + r.sales, 0)),
      shipping: round2(rows.reduce((a, r) => a + r.shipping, 0)),
      paypalFees: round2(rows.reduce((a, r) => a + (r.paypalFee ?? 0), 0)),
      receipts: round2(rows.reduce((a, r) => a + r.receipts, 0)),
    },
  };
}
