"use server";

import { db } from "@/lib/db";
import { paymentProofs, orders, paymentLinks } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertValidTransition } from "@/lib/orders";
import { writePaymentProof } from "@/lib/payment-proof-storage";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { revalidatePath } from "next/cache";

/**
 * Phase 20 (20-07) — payment proof review actions.
 *
 * Admin confirms or rejects uploaded slips; state transitions are guarded via
 * assertValidTransition. Token lifecycle (D-23): paymentLinks.usedAt is set
 * ONLY inside confirmPaymentProof — reject MUST NOT touch it so the customer
 * can re-open the same link and re-upload after a rejection.
 *
 * Every export awaits `requireAdmin()` first (CVE-2025-29927 mitigation).
 */

// ============================================================================
// Result types
// ============================================================================

export type ConfirmPaymentProofResult =
  | { ok: true; orderStatus: "paid" }
  | { ok: false; error: string };

export type RejectPaymentProofResult =
  | { ok: true }
  | { ok: false; error: string };

export type AdminUploadPaymentProofResult =
  | { ok: true; proofId: string }
  | { ok: false; error: string };

// ============================================================================
// confirmPaymentProof
// ============================================================================

/**
 * Approve a pending payment slip and transition the order to `paid`.
 *
 * Transaction:
 *   1. payment_proofs.status = 'approved', reviewed_by, reviewed_at
 *   2. orders.status = 'paid', payment_method = 'bank_transfer'
 *   3. payment_links.used_at = NOW() for all unused links on this order (D-23)
 *
 * Post-commit: fires sendOrderConfirmationEmail fire-and-forget (same call site
 * shape as src/actions/payment-links.ts:264 and src/actions/paypal.ts:700).
 */
export async function confirmPaymentProof(
  proofId: string,
): Promise<ConfirmPaymentProofResult> {
  const session = await requireAdmin();

  // SELECT proof
  const proof = await db.query.paymentProofs.findFirst({
    where: eq(paymentProofs.id, proofId),
  });
  if (!proof) return { ok: false, error: "Proof not found." };

  // SELECT order
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, proof.orderId),
  });
  if (!order) return { ok: false, error: "Order not found." };

  // Guard transition (awaiting_payment_review -> paid) — throws on invalid
  assertValidTransition(order.status, "paid");

  try {
    await db.transaction(async (tx) => {
      // 1. Approve the proof row
      await tx
        .update(paymentProofs)
        .set({
          status: "approved",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(paymentProofs.id, proofId));

      // 2. Transition order to paid, set payment method
      await tx
        .update(orders)
        .set({
          status: "paid",
          paymentMethod: "bank_transfer",
        })
        .where(eq(orders.id, order.id));

      // 3. Consume all unused payment links for this order (D-23 — token is
      //    consumed ONLY when the order reaches paid)
      await tx
        .update(paymentLinks)
        .set({ usedAt: new Date() })
        .where(eq(paymentLinks.orderId, order.id));
    });
  } catch (err) {
    console.error("[admin-payment-proofs] confirm transaction failed:", err);
    return { ok: false, error: "Could not confirm payment proof." };
  }

  // Post-paid side effect: order confirmation email — fire-and-forget (same
  // pattern as src/actions/payment-links.ts:264 PayPal capture site)
  void sendOrderConfirmationEmail(order.id).catch((err) =>
    console.error("[admin-payment-proofs] email send failed:", err),
  );

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/payment-links/[token]", "page");

  return { ok: true, orderStatus: "paid" };
}

// ============================================================================
// rejectPaymentProof
// ============================================================================

/**
 * Reject a pending payment slip and return the order to `awaiting_customer`.
 *
 * Requirements:
 *   - adminNote MUST be ≥ 8 chars (tells customer what was wrong).
 *   - MUST NOT touch paymentLinks.usedAt (D-23 — token stays alive for re-upload).
 *   - MUST NOT call sendOrderConfirmationEmail.
 *
 * Transaction:
 *   1. payment_proofs.status = 'rejected', admin_note, reviewed_by, reviewed_at
 *   2. orders.status = 'awaiting_customer' (payment_method retained)
 */
export async function rejectPaymentProof(
  proofId: string,
  adminNote: string,
): Promise<RejectPaymentProofResult> {
  const session = await requireAdmin();

  // Server-side validation — not just client-side (T-07 pattern)
  if (!adminNote || adminNote.trim().length < 8) {
    return {
      ok: false,
      error: "Admin note required (≥8 chars). Tell the customer what went wrong.",
    };
  }

  // SELECT proof
  const proof = await db.query.paymentProofs.findFirst({
    where: eq(paymentProofs.id, proofId),
  });
  if (!proof) return { ok: false, error: "Proof not found." };

  // SELECT order
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, proof.orderId),
  });
  if (!order) return { ok: false, error: "Order not found." };

  // Guard transition (awaiting_payment_review -> awaiting_customer)
  assertValidTransition(order.status, "awaiting_customer");

  try {
    await db.transaction(async (tx) => {
      // 1. Reject the proof row
      await tx
        .update(paymentProofs)
        .set({
          status: "rejected",
          adminNote: adminNote.trim(),
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(paymentProofs.id, proofId));

      // 2. Return order to awaiting_customer (payment_method retained — customer
      //    may re-upload the same method or switch to PayPal)
      await tx
        .update(orders)
        .set({ status: "awaiting_customer" })
        .where(eq(orders.id, order.id));

      // NOTE: paymentLinks.usedAt intentionally NOT updated here (D-23).
    });
  } catch (err) {
    console.error("[admin-payment-proofs] reject transaction failed:", err);
    return { ok: false, error: "Could not reject payment proof." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/payment-links/[token]", "page");

  return { ok: true };
}

// ============================================================================
// adminUploadPaymentProof
// ============================================================================

/**
 * Admin attaches a payment slip on behalf of the customer.
 *
 * Writes a payment_proofs row with uploaded_by='admin'. Does NOT auto-transition
 * the order status — admin must explicitly call confirmPaymentProof separately
 * (two-click safety per UI-SPEC D-11).
 *
 * File cap enforcement is inherited from writePaymentProof (D-10 — enforced in
 * both customer and admin upload paths).
 */
export async function adminUploadPaymentProof(
  orderId: string,
  formData: FormData,
): Promise<AdminUploadPaymentProofResult> {
  const session = await requireAdmin();

  // Validate order exists (no status restriction per D-08 — admin can attach
  // a slip at any pre-paid status)
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!order) return { ok: false, error: "Order not found." };

  // Extract file from FormData
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided." };
  }

  // Write file (caps + MIME allowlist enforced inside writePaymentProof, D-10)
  const stored = await writePaymentProof(orderId, file);
  if (!stored.ok) return { ok: false, error: stored.error };

  // Insert payment_proofs row
  const proofId = randomUUID();
  try {
    await db.insert(paymentProofs).values({
      id: proofId,
      orderId,
      imageUrl: stored.imageUrl,
      thumbnailUrl: stored.thumbnailUrl ?? undefined,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      uploadedBy: "admin",
      uploadedByUserId: session.user.id,
      status: "pending",
    });
  } catch (err) {
    console.error("[admin-payment-proofs] insert proof row failed:", err);
    return { ok: false, error: "Could not save payment proof record." };
  }

  revalidatePath(`/admin/orders/${orderId}`);

  return { ok: true, proofId };
}
