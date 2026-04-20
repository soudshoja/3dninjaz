"use server";

import { db } from "@/lib/db";
import { orders, orderItems, user } from "@/lib/db/schema";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
} from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { getCaptureDetails, type CaptureDetails } from "@/lib/paypal";
import type { OrderStatus } from "@/lib/orders";

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
  // Phase 7 (07-04) — financials cache columns
  refundedAmount: string;
  paypalFee: string | null;
  paypalNet: string | null;
};

export type PaymentStatusFilter = "all" | "active" | "cancelled";

// Phase 7 (07-04) — refund-status filter chip strip on /admin/payments.
export type RefundFilter = "any" | "none" | "partial" | "full";

function isRefundFilter(v: unknown): v is RefundFilter {
  return v === "any" || v === "none" || v === "partial" || v === "full";
}

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
  /** Phase 7 (07-04) — refund-status chip filter. */
  refunded?: RefundFilter;
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

  // Phase 7 (07-04) — refund chip filter. Compares refunded_amount (decimal
  // string) using SQL CAST so partial/full math is precise.
  const refunded: RefundFilter = isRefundFilter(input.refunded)
    ? input.refunded
    : "any";
  if (refunded === "none") {
    conditions.push(eq(orders.refundedAmount, "0.00"));
  } else if (refunded === "partial") {
    conditions.push(
      sql`CAST(${orders.refundedAmount} AS DECIMAL(10,2)) > 0 AND CAST(${orders.refundedAmount} AS DECIMAL(10,2)) < CAST(${orders.totalAmount} AS DECIMAL(10,2))`,
    );
  } else if (refunded === "full") {
    conditions.push(
      sql`CAST(${orders.refundedAmount} AS DECIMAL(10,2)) >= CAST(${orders.totalAmount} AS DECIMAL(10,2))`,
    );
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
      refundedAmount: orders.refundedAmount,
      paypalFee: orders.paypalFee,
      paypalNet: orders.paypalNet,
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
    refundedAmount: r.refundedAmount ?? "0.00",
    paypalFee: r.paypalFee ?? null,
    paypalNet: r.paypalNet ?? null,
  }));

  return { rows, page, pageSize: PAGE_SIZE, hasMore };
}

// ============================================================================
// Phase 7 (07-04) — per-payment detail action.
//
// getPaymentDetail(orderId): admin-gated; loads the order row, calls PayPal
// for live capture detail (gross/fee/net/sellerProtection/settle date), and
// hydrates the cache columns on first successful fetch (cache-fill on read).
// On PayPal failure (network / NOT_AUTHORIZED) returns the cached values
// with a `liveError` flag so the panel can show "live data unavailable".
// ============================================================================

export type PaymentDetail = {
  orderId: string;
  paypalCaptureId: string;
  paypalOrderId: string | null;
  localGross: string;
  localCurrency: string;
  localRefundedAmount: string;
  cachedFee: string | null;
  cachedNet: string | null;
  cachedSellerProtection: string | null;
  cachedSettleDate: Date | null;
  live: CaptureDetails | null;
  liveError: string | null;
  status: OrderStatus;
};

export async function getPaymentDetail(
  orderId: string,
): Promise<PaymentDetail | null> {
  await requireAdmin();
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!row || !row.paypalCaptureId) return null;

  let live: CaptureDetails | null = null;
  let liveError: string | null = null;
  try {
    live = await getCaptureDetails(row.paypalCaptureId);
  } catch (err) {
    liveError = err instanceof Error ? err.message : "Unknown error";
    // Translate technical errors to short admin-facing labels.
    if (liveError.includes("NOT_AUTHORIZED")) {
      liveError = "PayPal not authorised to read this capture.";
    }
    console.error("[admin-payments] live fetch failed:", err);
  }

  // Cache-hydrate on first successful fetch (D-07-04).
  if (live && (!row.paypalFee || !row.paypalNet)) {
    try {
      await db
        .update(orders)
        .set({
          paypalFee: live.feeValue ?? null,
          paypalNet: live.netValue ?? null,
          sellerProtection: live.sellerProtection ?? null,
          paypalSettleDate: live.settleDate ? new Date(live.settleDate) : null,
        })
        .where(eq(orders.id, orderId));
    } catch (err) {
      console.error("[admin-payments] cache hydration failed:", err);
    }
  }

  return {
    orderId: row.id,
    paypalCaptureId: row.paypalCaptureId,
    paypalOrderId: row.paypalOrderId ?? null,
    localGross: row.totalAmount,
    localCurrency: row.currency,
    localRefundedAmount: row.refundedAmount,
    cachedFee: row.paypalFee ?? null,
    cachedNet: row.paypalNet ?? null,
    cachedSellerProtection: row.sellerProtection ?? null,
    cachedSettleDate: row.paypalSettleDate ?? null,
    live,
    liveError,
    status: row.status as OrderStatus,
  };
}
