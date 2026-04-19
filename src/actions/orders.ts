"use server";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth-helpers";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";

/**
 * Customer-facing order actions.
 *
 * Scope (Plan 03-03):
 *  - listMyOrders — every order for the signed-in user, newest first
 *  - getMyOrder — single order with ownership or admin gate
 *  - resendOrderConfirmationEmail — rate-limited manual receipt resend
 *
 * Admin listing, status update, and notes actions live in `src/actions/admin-orders.ts`
 * (Plan 03-04, parallel executor).
 *
 * THREAT MODEL (per 03-CONTEXT):
 *  - T-03-21 / D3-22: getMyOrder returns null for non-owner + non-admin. The
 *    caller (/orders/[id]) invokes notFound() so the HTTP response is identical
 *    to a truly non-existent ID — blocks email enumeration.
 *  - T-03-22: resend rate-limited to 5-minute per-order cooldown via an
 *    in-process Map. Fine for v1 single-instance deploy. Swap for Redis when
 *    we go multi-instance.
 *  - T-03-23: the email address is read off the `orders` row snapshot, not the
 *    session. Even if an attacker hijacks a session they cannot redirect the
 *    receipt to a different address.
 */

// In-process rate limit map — fine for v1 solo-instance deploy.
// Format: Map<orderId, lastSentEpochMs>
const RESEND_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const resendLog = new Map<string, number>();

export async function listMyOrders() {
  const user = await getSessionUser();
  if (!user) return null;
  const rows = await db.query.orders.findMany({
    where: eq(orders.userId, user.id),
    orderBy: [desc(orders.createdAt)],
    with: { items: true },
  });
  return rows;
}

export async function getMyOrder(orderId: string) {
  const user = await getSessionUser();
  if (!user) return null;
  if (typeof orderId !== "string" || orderId.length === 0) return null;

  const row = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true },
  });
  if (!row) return null;
  // T-03-21 (D3-22): only owner OR admin may read. Same null return for both
  // "not found" and "not yours" — blocks email enumeration.
  if (row.userId !== user.id && user.role !== "admin") return null;
  return row;
}

export async function resendOrderConfirmationEmail(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, error: "Order not found." };
  }

  const row = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!row || (row.userId !== user.id && user.role !== "admin")) {
    // Same response shape for "not found" and "not yours" (T-03-21).
    return { ok: false, error: "Order not found." };
  }

  // Only post-paid orders have a receipt worth sending. Explicit allow-list
  // keeps future statuses (refunded etc.) from accidentally sending stale
  // receipts without review.
  if (
    row.status !== "paid" &&
    row.status !== "processing" &&
    row.status !== "shipped" &&
    row.status !== "delivered"
  ) {
    return { ok: false, error: "This order hasn't been paid yet." };
  }

  const last = resendLog.get(orderId) ?? 0;
  const now = Date.now();
  if (now - last < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
    return { ok: false, error: `Please wait ${waitSec}s before resending.` };
  }
  // Mark the attempt BEFORE sending so a slow SMTP cannot be hammered with
  // duplicate clicks (T-03-22).
  resendLog.set(orderId, now);

  await sendOrderConfirmationEmail(orderId);
  return { ok: true };
}
