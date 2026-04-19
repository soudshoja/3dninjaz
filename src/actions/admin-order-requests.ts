"use server";

/**
 * Phase 6 06-06 — admin approve/reject for cancel/return requests (CUST-07).
 *
 * THREAT MODEL:
 *  - T-06-06-admin-auth: requireAdmin() FIRST await on every export
 *  - T-06-06-state-machine: assertValidTransition reuses Phase 3 01 validator
 *    so admin cannot flip order.status invalidly even via approve-cancel.
 *  - T-06-06-transaction: approve-cancel wraps the order-status flip + the
 *    request status flip in db.transaction — no half-updated state.
 *  - T-06-06-idempotency: status !== "pending" guard prevents double-approve.
 */

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { orderRequests, orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertValidTransition, type OrderStatus } from "@/lib/orders";

export async function listOrderRequestsForOrder(orderId: string) {
  await requireAdmin();
  return db
    .select()
    .from(orderRequests)
    .where(eq(orderRequests.orderId, orderId))
    .orderBy(desc(orderRequests.createdAt));
}

type ActionResult = { ok: true } | { ok: false; error: string };

export async function approveOrderRequest(
  requestId: string,
  adminNotes?: string,
): Promise<ActionResult> {
  await requireAdmin();
  const result = await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(orderRequests)
      .where(eq(orderRequests.id, requestId))
      .limit(1);
    if (!req) return { ok: false as const, error: "Request not found." };
    if (req.status !== "pending") {
      return { ok: false as const, error: "Request is not pending." };
    }

    if (req.type === "cancel") {
      const [order] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, req.orderId))
        .limit(1);
      if (!order) return { ok: false as const, error: "Order not found." };
      try {
        assertValidTransition(order.status as OrderStatus, "cancelled");
      } catch {
        return {
          ok: false as const,
          error: "Order has already shipped — cancel no longer valid.",
        };
      }
      await tx
        .update(orders)
        .set({ status: "cancelled" })
        .where(eq(orders.id, req.orderId));
    }
    // For 'return', order.status stays 'delivered' (Assumption 6); only the
    // request transitions. Admin handles refund out-of-band in PayPal.

    await tx
      .update(orderRequests)
      .set({
        status: "approved",
        adminNotes: adminNotes ?? null,
        resolvedAt: new Date(),
      })
      .where(eq(orderRequests.id, requestId));

    return { ok: true as const, orderId: req.orderId };
  });

  if (result.ok) {
    revalidatePath(`/admin/orders/${result.orderId}`);
    revalidatePath(`/admin/orders`);
    revalidatePath(`/orders/${result.orderId}`);
    return { ok: true };
  }
  return result;
}

export async function rejectOrderRequest(
  requestId: string,
  adminNotes?: string,
): Promise<ActionResult> {
  await requireAdmin();
  const [req] = await db
    .select()
    .from(orderRequests)
    .where(eq(orderRequests.id, requestId))
    .limit(1);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") {
    return { ok: false, error: "Request is not pending." };
  }
  await db
    .update(orderRequests)
    .set({
      status: "rejected",
      adminNotes: adminNotes ?? null,
      resolvedAt: new Date(),
    })
    .where(eq(orderRequests.id, requestId));
  revalidatePath(`/admin/orders/${req.orderId}`);
  revalidatePath(`/orders/${req.orderId}`);
  return { ok: true };
}
