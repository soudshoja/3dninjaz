"use server";

/**
 * Phase 6 06-06 — customer-side cancel/return request submission (CUST-07).
 *
 * THREAT MODEL:
 *  - T-06-06-auth: requireUser() FIRST await on every export.
 *  - T-06-06-IDOR: ownership gate via SELECT orders.userId = session.user.id
 *    before allowing any insert; same null-shape response for missing AND
 *    not-yours order ids (enumeration block).
 *  - T-06-06-state-machine: server-side eligibility checks (status set + 14d
 *    return window) — client UI is a convenience layer.
 *  - T-06-06-one-pending: pre-insert SELECT blocks duplicate pending requests
 *    on the same order (Assumption 7; MariaDB has no clean partial unique).
 *  - T-06-06-PII-log: console.error logs only the error object — never the
 *    customer reason, address, or admin notes.
 */

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { orderRequests, orders } from "@/lib/db/schema";
import { orderRequestSchema } from "@/lib/validators";
import { requireUser } from "@/lib/auth-helpers";

import { RETURN_WINDOW_MS } from "@/lib/order-windows";

export type OrderRequestRow = {
  id: string;
  type: "cancel" | "return";
  status: "pending" | "approved" | "rejected";
  reason: string;
  adminNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

export async function listMyOrderRequests(
  orderId: string,
): Promise<OrderRequestRow[]> {
  const session = await requireUser();
  // Ownership check via orders.userId — a user cannot enumerate other
  // users' requests.
  const [order] = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.userId !== session.user.id) return [];

  const rows = await db
    .select({
      id: orderRequests.id,
      type: orderRequests.type,
      status: orderRequests.status,
      reason: orderRequests.reason,
      adminNotes: orderRequests.adminNotes,
      createdAt: orderRequests.createdAt,
      resolvedAt: orderRequests.resolvedAt,
    })
    .from(orderRequests)
    .where(eq(orderRequests.orderId, orderId))
    .orderBy(desc(orderRequests.createdAt));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    reason: r.reason,
    adminNotes: r.adminNotes ?? null,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt ?? null,
  }));
}

export async function submitOrderRequest(input: unknown) {
  const session = await requireUser();
  const parsed = orderRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  // Ownership + status gate via single SELECT.
  const [order] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);
  if (!order || order.userId !== session.user.id) {
    // Same response as truly missing — T-06-06-enumeration.
    return { ok: false as const, error: "Order not found." };
  }

  // Eligibility — server-side authoritative.
  if (parsed.data.type === "cancel") {
    if (!(order.status === "pending" || order.status === "paid")) {
      return {
        ok: false as const,
        error: "Cancel is only available before the order ships.",
      };
    }
  } else {
    // return
    if (order.status !== "delivered") {
      return {
        ok: false as const,
        error: "Return is only available after the order is delivered.",
      };
    }
    const ageMs = Date.now() - new Date(order.updatedAt).getTime();
    if (ageMs > RETURN_WINDOW_MS) {
      return {
        ok: false as const,
        error: "Return window closed. Contact support via WhatsApp.",
      };
    }
  }

  // One-pending-per-order rule (Assumption 7).
  const [existingPending] = await db
    .select({ id: orderRequests.id })
    .from(orderRequests)
    .where(
      and(
        eq(orderRequests.orderId, parsed.data.orderId),
        eq(orderRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (existingPending) {
    return {
      ok: false as const,
      error: "You already have a pending request on this order.",
    };
  }

  await db.insert(orderRequests).values({
    id: randomUUID(),
    orderId: parsed.data.orderId,
    userId: session.user.id,
    type: parsed.data.type,
    reason: parsed.data.reason,
    status: "pending",
  });

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath(`/admin/orders`);
  return {
    ok: true as const,
    message:
      parsed.data.type === "cancel"
        ? "Cancel request submitted. We'll review it shortly."
        : "Return request submitted. We'll review it shortly.",
  };
}
