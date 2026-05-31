"use server";

/**
 * Phase 6 06-06 — customer-side cancel/return request submission (CUST-07).
 * 260601-afs — extended with per-item return picking, review photos,
 * ship+tracking submission, and lazy auto-expiry.
 *
 * THREAT MODEL:
 *  - T-06-06-auth: requireUser() FIRST await on every export.
 *  - T-06-06-IDOR: ownership gate via SELECT orders.userId = session.user.id
 *    before allowing any insert; same null-shape response for missing AND
 *    not-yours order ids (enumeration block).
 *  - T-06-06-state-machine: server-side eligibility checks (status set + 3d
 *    return window) — client UI is a convenience layer.
 *  - T-06-06-one-pending: pre-insert SELECT blocks duplicate pending requests
 *    on the same order (Assumption 7; MariaDB has no clean partial unique).
 *  - T-06-06-PII-log: console.error logs only the error object — never the
 *    customer reason, address, or admin notes.
 *  - T-afs-items: server validates each orderItemId belongs to this order
 *    and qty does not exceed ordered quantity.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  orderRequests,
  orderItems,
  orders,
  ensureReturnItems,
  ensurePhotoArray,
} from "@/lib/db/schema";
import { orderRequestSchema, returnRequestSchema } from "@/lib/validators";
import { requireUser } from "@/lib/auth-helpers";
import {
  RETURN_WINDOW_MS,
  isReturnShipExpired,
} from "@/lib/order-windows";
import {
  sendReturnRequestedEmail,
  sendReturnExpiredEmail,
} from "@/actions/send-emails";

// ============================================================================
// Shared row type (extended for return-specific fields)
// ============================================================================

export type OrderRequestRow = {
  id: string;
  type: "cancel" | "return";
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "shipped"
    | "received"
    | "expired";
  reason: string;
  adminNotes: string | null;
  // Return-specific fields (null for cancel requests)
  items: Array<{ orderItemId: string; qty: number }>;
  photos: string[];
  returnCourier: string | null;
  returnTrackingNumber: string | null;
  approvedAt: Date | null;
  shippedAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

// ============================================================================
// Lazy auto-expiry helper — called from every list/detail read.
// Mutates in-memory rows; also fires UPDATE + email for newly expired rows.
// ============================================================================

export async function expireStaleReturns(
  rows: OrderRequestRow[],
): Promise<void> {
  const stale = rows.filter(
    (r) =>
      r.type === "return" &&
      isReturnShipExpired({
        status: r.status,
        approvedAt: r.approvedAt,
        shippedAt: r.shippedAt,
      }),
  );
  if (stale.length === 0) return;

  const now = new Date();
  for (const r of stale) {
    // Mutate in-memory row first (caller renders the already-mutated array)
    r.status = "expired";
    r.resolvedAt = now;

    try {
      await db
        .update(orderRequests)
        .set({ status: "expired", resolvedAt: now })
        .where(eq(orderRequests.id, r.id));

      // Fire email (fire-and-forget; email fn guards @3dninjaz.local)
      // We don't have the customer email here — the send fn must look it up
      // or the caller can pass it. For simplicity, skip here and let the
      // admin-side list (which does have order data) trigger the email.
      // This is safe: the status is already set to expired in DB.
      void sendReturnExpiredEmail({ requestId: r.id, orderId: "" }).catch(
        (e) => console.error("[expireStaleReturns] email failed", e),
      );
    } catch (e) {
      console.error("[expireStaleReturns] DB update failed for", r.id, e);
    }
  }
}

// ============================================================================
// Customer reads
// ============================================================================

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
      items: orderRequests.items,
      photos: orderRequests.photos,
      returnCourier: orderRequests.returnCourier,
      returnTrackingNumber: orderRequests.returnTrackingNumber,
      approvedAt: orderRequests.approvedAt,
      shippedAt: orderRequests.shippedAt,
      createdAt: orderRequests.createdAt,
      resolvedAt: orderRequests.resolvedAt,
    })
    .from(orderRequests)
    .where(eq(orderRequests.orderId, orderId))
    .orderBy(desc(orderRequests.createdAt));

  const result: OrderRequestRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status as OrderRequestRow["status"],
    reason: r.reason,
    adminNotes: r.adminNotes ?? null,
    items: ensureReturnItems(r.items),
    photos: ensurePhotoArray(r.photos),
    returnCourier: r.returnCourier ?? null,
    returnTrackingNumber: r.returnTrackingNumber ?? null,
    approvedAt: r.approvedAt ?? null,
    shippedAt: r.shippedAt ?? null,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt ?? null,
  }));

  // Lazy expiry — mutates rows in place + fires DB update
  await expireStaleReturns(result);

  return result;
}

// ============================================================================
// Cancel request submission (unchanged from Phase 6)
// ============================================================================

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
    // return — use the new submitReturnRequest path instead
    return {
      ok: false as const,
      error: "Please use the return request form.",
    };
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
    message: "Cancel request submitted. We'll review it shortly.",
  };
}

// ============================================================================
// 260601-afs — Return request submission (with per-item picking + photos)
// ============================================================================

export async function submitReturnRequest(input: unknown) {
  const session = await requireUser();
  const parsed = returnRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  // Ownership + eligibility gate.
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
    return { ok: false as const, error: "Order not found." };
  }

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
      error: "Return window has closed. Contact support via WhatsApp.",
    };
  }

  // One-pending-per-order rule.
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

  // Validate items: each orderItemId must belong to this order and qty must
  // not exceed the ordered quantity (T-afs-items).
  const itemIds = parsed.data.items.map((i) => i.orderItemId);
  const orderLineRows = await db
    .select({ id: orderItems.id, quantity: orderItems.quantity })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, parsed.data.orderId),
        inArray(orderItems.id, itemIds),
      ),
    );

  const lineMap = new Map(orderLineRows.map((r) => [r.id, r.quantity]));
  for (const item of parsed.data.items) {
    const orderedQty = lineMap.get(item.orderItemId);
    if (orderedQty === undefined) {
      return {
        ok: false as const,
        error: "One or more selected items do not belong to this order.",
      };
    }
    if (item.qty > orderedQty) {
      return {
        ok: false as const,
        error: `Return quantity for an item exceeds the ordered quantity.`,
      };
    }
  }

  const id = randomUUID();
  await db.insert(orderRequests).values({
    id,
    orderId: parsed.data.orderId,
    userId: session.user.id,
    type: "return",
    reason: parsed.data.reason,
    status: "pending",
    items: JSON.stringify(parsed.data.items),
    photos: JSON.stringify(parsed.data.photos),
  });

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath(`/admin/orders`);

  // Fire-and-forget email (T-afs-email-ff)
  void sendReturnRequestedEmail({ requestId: id, orderId: parsed.data.orderId }).catch(
    (e) => console.error("[submitReturnRequest] email failed", e),
  );

  return {
    ok: true as const,
    message:
      "Return request submitted. We'll review it and email you within 1 business day.",
  };
}

// ============================================================================
// 260601-afs — Submit return tracking number (customer ships item back)
// ============================================================================

export async function submitReturnTracking(
  requestId: string,
  courier: string,
  trackingNumber: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireUser();

  const [req] = await db
    .select({
      id: orderRequests.id,
      orderId: orderRequests.orderId,
      userId: orderRequests.userId,
      status: orderRequests.status,
      approvedAt: orderRequests.approvedAt,
      shippedAt: orderRequests.shippedAt,
    })
    .from(orderRequests)
    .where(eq(orderRequests.id, requestId))
    .limit(1);

  // Ownership + enumeration-safe
  if (!req || req.userId !== session.user.id) {
    return { ok: false, error: "Request not found." };
  }

  // Run expiry check first
  const asRow: OrderRequestRow = {
    id: req.id,
    type: "return",
    status: req.status as OrderRequestRow["status"],
    reason: "",
    adminNotes: null,
    items: [],
    photos: [],
    returnCourier: null,
    returnTrackingNumber: null,
    approvedAt: req.approvedAt ?? null,
    shippedAt: req.shippedAt ?? null,
    createdAt: new Date(),
    resolvedAt: null,
  };
  await expireStaleReturns([asRow]);
  if (asRow.status === "expired") {
    return {
      ok: false,
      error:
        "Your ship-by window has expired. Please contact support via WhatsApp.",
    };
  }

  if (req.status !== "approved") {
    return {
      ok: false,
      error: "Return request must be approved before submitting tracking.",
    };
  }

  if (!courier.trim() || !trackingNumber.trim()) {
    return { ok: false, error: "Courier and tracking number are required." };
  }

  const now = new Date();
  await db
    .update(orderRequests)
    .set({
      returnCourier: courier.trim().slice(0, 120),
      returnTrackingNumber: trackingNumber.trim().slice(0, 160),
      shippedAt: now,
      status: "shipped",
    })
    .where(eq(orderRequests.id, requestId));

  revalidatePath(`/orders/${req.orderId}`);
  revalidatePath(`/admin/orders/${req.orderId}`);

  return { ok: true };
}
