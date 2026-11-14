"use server";

// ============================================================================
// Payment-method tagging for paid orders. Needed so each paid order lands in
// the right account balance (PayPal / bank / cash). A paid order with no method
// counts as sales but moves no balance until it is tagged.
//
// requireAdmin() is the FIRST await in every export (CVE-2025-29927). This is a
// "use server" file: async functions only; the result type is in
// @/lib/accounting-entry-types.
// ============================================================================

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/accounting-types";
import type { OrderTagResult } from "@/lib/accounting-entry-types";

const PAID = sql`CAST(${orders.amountPaid} AS DECIMAL(10,2)) > 0`;

function isMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}

function revalidate(orderId?: string) {
  revalidatePath("/admin/orders");
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/accounting");
  revalidatePath("/admin/accounting/paypal");
}

/** Count of paid, non-PayPal-captured orders that still have no payment method. */
export async function countPaidOrdersMethodUnknown(): Promise<number> {
  await requireAdmin();
  const [row] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(orders)
    .where(and(PAID, isNull(orders.paymentMethod), isNull(orders.paypalCaptureId)));
  return Number(row?.n ?? 0);
}

/** Ids of paid orders with no payment method (for the orders list filter). */
export async function listPaidOrderIdsMethodUnknown(): Promise<string[]> {
  await requireAdmin();
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(PAID, isNull(orders.paymentMethod), isNull(orders.paypalCaptureId)));
  return rows.map((r) => r.id);
}

/**
 * Set (or correct) the payment method of ONE paid order. A PayPal-captured
 * order cannot be re-tagged to something else: the money demonstrably went
 * through PayPal.
 */
export async function setOrderPaymentMethod(
  orderId: string,
  method: string,
): Promise<OrderTagResult> {
  await requireAdmin();
  if (!isMethod(method)) return { ok: false, error: "Choose PayPal, Bank transfer, Cash or Other." };
  const [o] = await db
    .select({
      amountPaid: orders.amountPaid,
      capture: orders.paypalCaptureId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!o) return { ok: false, error: "Order not found." };
  if (!(Number(o.amountPaid) > 0)) {
    return { ok: false, error: "Only paid orders need a payment method." };
  }
  if (o.capture && method !== "paypal") {
    return { ok: false, error: "This order was captured by PayPal, so its method stays PayPal." };
  }
  try {
    await db.update(orders).set({ paymentMethod: method }).where(eq(orders.id, orderId));
  } catch (e) {
    console.error("[admin-order-payment-method] setOrderPaymentMethod", e);
    return { ok: false, error: "Unable to save the payment method." };
  }
  revalidate(orderId);
  return { ok: true, updated: 1 };
}

/**
 * Tag many orders at once. Only touches paid orders whose method is still NULL
 * and that PayPal did not capture, so an existing method (or a captured order)
 * can never be overwritten by a bulk action.
 */
export async function bulkSetOrderPaymentMethod(
  orderIds: string[],
  method: string,
): Promise<OrderTagResult> {
  await requireAdmin();
  if (!isMethod(method)) return { ok: false, error: "Choose PayPal, Bank transfer, Cash or Other." };
  const ids = [...new Set(orderIds.filter((x) => typeof x === "string" && x.length > 0))].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Select at least one order." };
  try {
    const [res] = await db
      .update(orders)
      .set({ paymentMethod: method })
      .where(and(inArray(orders.id, ids), PAID, isNull(orders.paymentMethod), isNull(orders.paypalCaptureId)));
    const updated = (res as unknown as { affectedRows?: number })?.affectedRows ?? 0;
    revalidate();
    return { ok: true, updated };
  } catch (e) {
    console.error("[admin-order-payment-method] bulkSetOrderPaymentMethod", e);
    return { ok: false, error: "Unable to tag these orders." };
  }
}
