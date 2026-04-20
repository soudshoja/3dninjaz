"use server";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { issueCaptureRefund } from "@/lib/paypal-refund";
import { checkRateLimit } from "@/lib/rate-limit";
import type { OrderStatus } from "@/lib/orders";

/**
 * Phase 7 (07-05) — refund server action.
 *
 * Server-side cap: refundAmount <= (totalAmount - refundedAmount). Verified
 * BEFORE the PayPal call (T-07-05-money). Rate-limited 5/min/admin
 * (T-07-05-DoS). Successful refund writes refundedAmount; full refund flips
 * status to 'cancelled'.
 *
 * Webhook handler in src/app/api/paypal/webhook/route.ts is idempotent on
 * PAYMENT.CAPTURE.REFUNDED so replays don't double-count (T-07-05-replay).
 */

export type IssueRefundActionInput = {
  orderId: string;
  /** Partial refund amount; omit for full refund of remaining. */
  amount?: number;
  reason: string;
};

export type IssueRefundActionResult =
  | {
      ok: true;
      refundId: string;
      refundedAmount: string;
      orderStatus: OrderStatus;
    }
  | { ok: false; error: string; errorCode?: string };

export async function issueRefund(
  input: IssueRefundActionInput,
): Promise<IssueRefundActionResult> {
  const session = await requireAdmin();

  const limit = checkRateLimit(`refund:${session.user.id}`, 5, 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many refunds. Try again in ${Math.ceil(limit.retryAfterMs / 1000)}s.`,
    };
  }

  const reason = (input.reason ?? "").trim();
  if (reason.length === 0 || reason.length > 200) {
    return { ok: false, error: "Reason is required (1-200 chars)." };
  }

  const row = await db.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!row || !row.paypalCaptureId) {
    return { ok: false, error: "Order has no PayPal capture to refund." };
  }

  const total = parseFloat(row.totalAmount);
  const alreadyRefunded = parseFloat(row.refundedAmount);
  const remaining = +(total - alreadyRefunded).toFixed(2);
  if (remaining <= 0) {
    return { ok: false, error: "This order is already fully refunded." };
  }

  // Server-side cap (T-07-05-money). NEVER trust client amount.
  let refundAmt: number;
  if (input.amount == null) {
    refundAmt = remaining; // full refund of remainder
  } else {
    const a = Number(input.amount);
    if (!Number.isFinite(a) || a <= 0) {
      return { ok: false, error: "Refund amount must be positive." };
    }
    if (a > remaining + 0.001) {
      return {
        ok: false,
        error: `Refund amount exceeds the remaining capture (RM ${remaining.toFixed(2)}).`,
      };
    }
    refundAmt = +a.toFixed(2);
  }

  const r = await issueCaptureRefund({
    captureId: row.paypalCaptureId,
    amount: refundAmt,
    currency: row.currency,
    reason,
    invoiceId: row.id,
  });
  if (!r.ok) {
    return { ok: false, error: r.error, errorCode: r.errorCode };
  }

  // Atomic DB update.
  const newRefunded = +(alreadyRefunded + refundAmt).toFixed(2);
  const fullyRefunded = newRefunded + 0.001 >= total;
  try {
    await db
      .update(orders)
      .set({
        refundedAmount: newRefunded.toFixed(2),
        ...(fullyRefunded ? { status: "cancelled" } : {}),
      })
      .where(eq(orders.id, input.orderId));
  } catch (err) {
    console.error("[admin-refunds] DB update failed:", err);
    // PayPal already refunded — webhook will reconcile if this transient.
  }

  revalidatePath(`/admin/payments/${input.orderId}`);
  revalidatePath(`/admin/orders/${input.orderId}`);
  revalidatePath("/admin/payments");

  return {
    ok: true,
    refundId: r.refundId,
    refundedAmount: newRefunded.toFixed(2),
    orderStatus: fullyRefunded ? "cancelled" : (row.status as OrderStatus),
  };
}
