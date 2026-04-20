"use server";

import { db } from "@/lib/db";
import { orders, orderItems, user } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

// ============================================================================
// /admin/payments — captured PayPal transactions report.
//
// Surface every order whose paypalCaptureId is set, plus the buyer email +
// item count, so admin can reconcile against PayPal's dashboard without
// logging in there. Refund support is intentionally NOT modelled here yet
// (no refund flow shipped); a future "refunded" status will plug into
// `paymentStatus` cleanly.
//
// Conforms to the Phase 5/6 admin pattern:
//   - requireAdmin() FIRST await (T-03-30 / CVE-2025-29927)
//   - manual hydration (no LATERAL joins on MariaDB 10.11)
//   - 50-row pagination via offset/limit so the page stays cheap as orders grow
// ============================================================================

export type AdminPaymentRow = {
  orderId: string;
  paypalOrderId: string | null;
  paypalCaptureId: string;
  amount: string;
  currency: string;
  status: "paid" | "processing" | "shipped" | "delivered" | "cancelled";
  customerName: string;
  customerEmail: string;
  itemCount: number;
  createdAt: Date;
};

export type PaymentStatusFilter = "all" | "active" | "cancelled";

const PAGE_SIZE = 50;

function isPaymentStatus(v: unknown): v is PaymentStatusFilter {
  return v === "all" || v === "active" || v === "cancelled";
}

function parseDateOrNull(v: string | null | undefined): Date | null {
  if (!v) return null;
  // Accept yyyy-mm-dd (HTML date input native format). Anything that fails
  // Date parsing falls through to null so the filter is effectively ignored.
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export type ListAdminPaymentsInput = {
  status?: PaymentStatusFilter;
  /** ISO yyyy-mm-dd lower bound (inclusive). */
  from?: string;
  /** ISO yyyy-mm-dd upper bound (exclusive — interpreted as start of next day). */
  to?: string;
  /** Zero-indexed page offset. Defaults to 0. */
  page?: number;
};

export type ListAdminPaymentsResult = {
  rows: AdminPaymentRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export async function listAdminPayments(
  input: ListAdminPaymentsInput = {},
): Promise<ListAdminPaymentsResult> {
  await requireAdmin();

  const status = isPaymentStatus(input.status) ? input.status : "all";
  const fromDate = parseDateOrNull(input.from);
  const toDate = parseDateOrNull(input.to);
  // The page input may arrive as a query-string number; clamp negative values.
  const page = Math.max(0, Math.floor(Number(input.page) || 0));

  const conditions = [isNotNull(orders.paypalCaptureId)];

  if (status === "active") {
    // Anything that isn't cancelled. Pending+unpaid orders never reach the
    // capture step so they're naturally excluded by the isNotNull filter.
    conditions.push(
      inArray(orders.status, ["paid", "processing", "shipped", "delivered"]),
    );
  } else if (status === "cancelled") {
    conditions.push(eq(orders.status, "cancelled"));
  }

  if (fromDate) conditions.push(gte(orders.createdAt, fromDate));
  if (toDate) {
    // Convert yyyy-mm-dd "to" to start-of-next-day so the upper bound is
    // exclusive and includes captures recorded later in the same day.
    const upper = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
    conditions.push(lt(orders.createdAt, upper));
  }

  // Fetch one extra row so we can compute hasMore without a COUNT query.
  const rawRows = await db
    .select({
      orderId: orders.id,
      paypalOrderId: orders.paypalOrderId,
      paypalCaptureId: orders.paypalCaptureId,
      amount: orders.totalAmount,
      currency: orders.currency,
      status: orders.status,
      customerName: orders.shippingName,
      customerEmail: orders.customerEmail,
      createdAt: orders.createdAt,
      userId: orders.userId,
      userEmail: user.email,
      userName: user.name,
    })
    .from(orders)
    .leftJoin(user, eq(orders.userId, user.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .offset(page * PAGE_SIZE)
    .limit(PAGE_SIZE + 1);

  const hasMore = rawRows.length > PAGE_SIZE;
  const sliceRows = hasMore ? rawRows.slice(0, PAGE_SIZE) : rawRows;

  // Hydrate item counts in a second SELECT — no LATERAL joins on MariaDB 10.11.
  const orderIds = sliceRows.map((r) => r.orderId);
  let countByOrder = new Map<string, number>();
  if (orderIds.length > 0) {
    const items = await db
      .select({
        orderId: orderItems.orderId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));
    for (const it of items) {
      countByOrder.set(
        it.orderId,
        (countByOrder.get(it.orderId) ?? 0) + it.quantity,
      );
    }
  }

  const rows: AdminPaymentRow[] = sliceRows.map((r) => ({
    orderId: r.orderId,
    paypalOrderId: r.paypalOrderId ?? null,
    // After the isNotNull filter we know this is non-null at the SQL layer,
    // but TS still sees it as nullable — coerce with empty string fallback.
    paypalCaptureId: r.paypalCaptureId ?? "",
    amount: r.amount,
    currency: r.currency,
    status: r.status as AdminPaymentRow["status"],
    customerName: r.userName?.trim() || r.customerName,
    customerEmail: r.userEmail || r.customerEmail,
    itemCount: countByOrder.get(r.orderId) ?? 0,
    createdAt: r.createdAt,
  }));

  return { rows, page, pageSize: PAGE_SIZE, hasMore };
}
