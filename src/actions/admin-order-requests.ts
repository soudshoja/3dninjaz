"use server";

/**
 * Phase 6 06-06 — admin approve/reject for cancel/return requests (CUST-07).
 * 260601-afs — extended with:
 *   - approveOrderRequest: sets approvedAt, fires return_approved email
 *   - rejectOrderRequest: fires return_rejected email
 *   - markReturnReceived: terminal state, fires return_received email
 *   - listOrderRequestsForOrder: runs lazy expiry on all rows
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
import {
  orderRequests,
  orders,
  ensureReturnItems,
  ensurePhotoArray,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertValidTransition, formatOrderNumber, type OrderStatus } from "@/lib/orders";
import { isReturnShipExpired } from "@/lib/order-windows";
import {
  sendReturnApprovedEmail,
  sendReturnRejectedEmail,
  sendReturnReceivedEmail,
  sendReturnExpiredEmail,
  sendOrderCancelledEmail,
} from "@/actions/send-emails";
import { sendWhatsAppNotification } from "@/lib/whatsapp/sender";

// ============================================================================
// Shared admin row type
// ============================================================================

export type AdminOrderRequestRow = {
  id: string;
  orderId: string;
  userId: string;
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
// Lazy expiry (admin-side mirror of the customer-side helper)
// ============================================================================

async function expireStaleReturnsAdmin(
  rows: AdminOrderRequestRow[],
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
    r.status = "expired";
    r.resolvedAt = now;

    try {
      await db
        .update(orderRequests)
        .set({ status: "expired", resolvedAt: now })
        .where(eq(orderRequests.id, r.id));

      // Fire email with full context available in admin list
      void sendReturnExpiredEmail({ requestId: r.id, orderId: r.orderId }).catch(
        (e) => console.error("[expireStaleReturnsAdmin] email failed", e),
      );
      // Fire return_expired WhatsApp notification (best-effort, async lookup)
      void (async () => {
        try {
          const [orderRow] = await db
            .select({ shippingPhone: orders.shippingPhone, shippingName: orders.shippingName })
            .from(orders)
            .where(eq(orders.id, r.orderId))
            .limit(1);
          if (orderRow) {
            await sendWhatsAppNotification("return_expired", orderRow.shippingPhone, {
              customerName: orderRow.shippingName,
              orderNumber: formatOrderNumber(r.orderId),
            });
          }
        } catch { /* best-effort */ }
      })();
    } catch (e) {
      console.error("[expireStaleReturnsAdmin] DB update failed for", r.id, e);
    }
  }
}

// ============================================================================
// List
// ============================================================================

export async function listOrderRequestsForOrder(
  orderId: string,
): Promise<AdminOrderRequestRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(orderRequests)
    .where(eq(orderRequests.orderId, orderId))
    .orderBy(desc(orderRequests.createdAt));

  const result: AdminOrderRequestRow[] = rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    userId: r.userId,
    type: r.type,
    status: r.status as AdminOrderRequestRow["status"],
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

  await expireStaleReturnsAdmin(result);
  return result;
}

// ============================================================================
// Approve
// ============================================================================

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

    const now = new Date();
    await tx
      .update(orderRequests)
      .set({
        status: "approved",
        adminNotes: adminNotes ?? null,
        approvedAt: req.type === "return" ? now : null,
        resolvedAt: req.type === "cancel" ? now : null,
      })
      .where(eq(orderRequests.id, requestId));

    return { ok: true as const, orderId: req.orderId, type: req.type, requestId };
  });

  if (result.ok) {
    revalidatePath(`/admin/orders/${result.orderId}`);
    revalidatePath(`/admin/orders`);
    revalidatePath(`/orders/${result.orderId}`);

    // Fire approval email for return requests (fire-and-forget)
    if (result.type === "return") {
      void sendReturnApprovedEmail({
        requestId: result.requestId,
        orderId: result.orderId,
      }).catch((e) =>
        console.error("[approveOrderRequest] return email failed", e),
      );
      // WhatsApp: fetch order contact fields for the sender (fire-and-forget)
      void (async () => {
        try {
          const [orderRow] = await db
            .select({ shippingPhone: orders.shippingPhone, shippingName: orders.shippingName })
            .from(orders)
            .where(eq(orders.id, result.orderId))
            .limit(1);
          const [reqRow] = await db
            .select({ approvedAt: orderRequests.approvedAt })
            .from(orderRequests)
            .where(eq(orderRequests.id, result.requestId))
            .limit(1);
          const shipByDate = reqRow?.approvedAt
            ? new Date(new Date(reqRow.approvedAt).getTime() + 3 * 24 * 3600 * 1000)
                .toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
            : "within 3 days";
          await sendWhatsAppNotification("return_approved", orderRow?.shippingPhone, {
            customerName: orderRow?.shippingName,
            orderNumber: formatOrderNumber(result.orderId),
            shipByDate,
          });
        } catch { /* best-effort */ }
      })();
    }

    // Fire order_cancelled email + WhatsApp for cancel requests (fire-and-forget)
    if (result.type === "cancel") {
      void (async () => {
        try {
          const [orderRow] = await db
            .select({
              shippingPhone: orders.shippingPhone,
              shippingName: orders.shippingName,
              customerEmail: orders.customerEmail,
            })
            .from(orders)
            .where(eq(orders.id, result.orderId))
            .limit(1);
          if (orderRow) {
            void sendOrderCancelledEmail({
              customerEmail: orderRow.customerEmail,
              customerName: orderRow.shippingName,
              orderNumber: formatOrderNumber(result.orderId),
              cancellationReason: "Your cancellation request has been approved.",
              orderId: result.orderId,
            }).catch((e) => console.error("[approveOrderRequest] cancel email failed", e));
            await sendWhatsAppNotification("order_cancelled", orderRow.shippingPhone, {
              customerName: orderRow.shippingName,
              orderNumber: formatOrderNumber(result.orderId),
              reason: "Your cancellation request has been approved.",
            });
          }
        } catch { /* best-effort */ }
      })();
    }

    return { ok: true };
  }
  return result;
}

// ============================================================================
// Reject
// ============================================================================

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

  // Fire rejection email (fire-and-forget)
  if (req.type === "return") {
    void sendReturnRejectedEmail({
      requestId: req.id,
      orderId: req.orderId,
      reason: adminNotes ?? "No reason provided.",
    }).catch((e) =>
      console.error("[rejectOrderRequest] return email failed", e),
    );
    void (async () => {
      try {
        const [orderRow] = await db
          .select({ shippingPhone: orders.shippingPhone, shippingName: orders.shippingName })
          .from(orders)
          .where(eq(orders.id, req.orderId))
          .limit(1);
        await sendWhatsAppNotification("return_rejected", orderRow?.shippingPhone, {
          customerName: orderRow?.shippingName,
          orderNumber: formatOrderNumber(req.orderId),
          reason: adminNotes ?? "No reason provided.",
        });
      } catch { /* best-effort */ }
    })();
  }

  return { ok: true };
}

// ============================================================================
// 260601-afs — Mark received (terminal state)
// ============================================================================

export async function markReturnReceived(
  requestId: string,
): Promise<ActionResult> {
  await requireAdmin();

  const [req] = await db
    .select()
    .from(orderRequests)
    .where(eq(orderRequests.id, requestId))
    .limit(1);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.type !== "return") {
    return { ok: false, error: "Only return requests can be marked received." };
  }
  if (req.status !== "shipped") {
    return {
      ok: false,
      error: "Request must be in 'shipped' status to mark as received.",
    };
  }

  const now = new Date();
  await db
    .update(orderRequests)
    .set({ status: "received", resolvedAt: now })
    .where(eq(orderRequests.id, requestId));

  revalidatePath(`/admin/orders/${req.orderId}`);
  revalidatePath(`/orders/${req.orderId}`);

  // Fire received email (fire-and-forget)
  void sendReturnReceivedEmail({
    requestId: req.id,
    orderId: req.orderId,
  }).catch((e) =>
    console.error("[markReturnReceived] email failed", e),
  );
  void (async () => {
    try {
      const [orderRow] = await db
        .select({ shippingPhone: orders.shippingPhone, shippingName: orders.shippingName })
        .from(orders)
        .where(eq(orders.id, req.orderId))
        .limit(1);
      await sendWhatsAppNotification("return_received", orderRow?.shippingPhone, {
        customerName: orderRow?.shippingName,
        orderNumber: formatOrderNumber(req.orderId),
      });
    } catch { /* best-effort */ }
  })();

  return { ok: true };
}
