"use server";

import { db } from "@/lib/db";
import { orders, paymentLinks, orderItems, paymentProofs, couponRedemptions } from "@/lib/db/schema";
import { eq, inArray, desc, sql } from "drizzle-orm";
import { ordersController, PAYPAL_CURRENCY } from "@/lib/paypal";
import { CheckoutPaymentIntent } from "@paypal/paypal-server-sdk";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { revalidatePath } from "next/cache";
import { sendWhatsAppNotification, sendWhatsAppInvoicePdf } from "@/lib/whatsapp/sender";
import { writePaymentProof } from "@/lib/payment-proof-storage";
import { assertValidTransition } from "@/lib/orders";
import crypto from "node:crypto";
import { publicUrl } from "@/lib/public-url";

/**
 * Phase 7 (07-03) — PUBLIC payment-link actions.
 * Phase 20 (20-06) — Extended for bank-transfer flow.
 *
 * PUBLIC FILE — no admin session required to call these actions.
 * The token itself is the credential. Server NEVER trusts a client-sent
 * amount: every PayPal call re-derives `orders.totalAmount` keyed by the
 * token row (T-07-X-money).
 *
 * URL contains ONLY the token — never email/name/phone in URL or query
 * (T-07-X-PII-on-payment-link).
 *
 * D-23: paymentLinks.usedAt is set ONLY when order reaches `paid`.
 * Slip upload alone does NOT mark the token used.
 * D-25: Public token actions — token+status validation is the only gate.
 */

/** Snapshot of a single order line for the public payment page. */
export type PaymentLinkOrderItem = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  productImage: string | null;
  variantLabel: string | null;
  configurationData: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
};

/** Snapshot of a payment proof row for the public payment page. */
export type PaymentLinkProof = {
  id: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: "customer" | "admin";
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: Date;
};

export type PaymentLinkView = {
  ok: true;
  /** true once payment has been captured (PayPal capture id set or status paid/processing/shipped/delivered). */
  paid: boolean;
  link: { id: string; token: string; expiresAt: Date };
  order: {
    id: string;
    orderNumber: string;
    customItemName: string | null;
    customItemDescription: string | null;
    customImages: string[];
    subtotal: string;
    shippingCost: string;
    shippingServiceName: string | null;
    shippingServiceCode: string | null;
    discountAmount: string;
    totalAmount: string;
    currency: string;
    /** Phase 20 (20-06): payment method — null until customer selects one. */
    paymentMethod: "paypal" | "bank_transfer" | null;
    /** Phase 20 (20-08): order status — needed for UI branching on the public page. */
    status: string;
  };
  /** Phase 20 (20-06): line items for the order (manual multi-query hydration — no LATERAL). */
  orderItems: PaymentLinkOrderItem[];
  /** Phase 20 (20-06): payment proofs for this order, latest first (empty for new orders). */
  paymentProofs: PaymentLinkProof[];
};

export type PaymentLinkError = {
  ok: false;
  error: "expired" | "used" | "not-found" | "already-paid";
};

/** Set of paid/terminal statuses that constitute a "paid" order. */
const PAID_ORDER_STATUSES = new Set([
  "paid",
  "processing",
  "shipped",
  "delivered",
]);

function ensureImagesArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // fallthrough
    }
  }
  return [];
}

function shortOrderNumber(id: string): string {
  const hex = id.replace(/-/g, "");
  return `PN-${hex.slice(-8).toUpperCase()}`;
}

/**
 * Live token statuses for bank-transfer flow (D-23).
 * `pending`                 — Phase 7 PayPal-only (unchanged)
 * `awaiting_customer`       — Phase 20 draft sent to customer; awaiting payment
 * `awaiting_payment_review` — customer uploaded slip; re-open allowed after rejection
 *
 * Any other status (paid, processing, shipped, delivered, cancelled) is treated
 * as "already-paid" or terminal — token is no longer live.
 */
const LIVE_ORDER_STATUSES = new Set([
  "pending",
  "awaiting_customer",
  "awaiting_payment_review",
]);

export async function getPaymentLinkByToken(
  token: string,
): Promise<PaymentLinkView | PaymentLinkError> {
  if (!token || typeof token !== "string" || token.length > 64) {
    return { ok: false, error: "not-found" };
  }
  const link = await db.query.paymentLinks.findFirst({
    where: eq(paymentLinks.token, token),
  });
  if (!link) return { ok: false, error: "not-found" };

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, link.orderId),
  });
  if (!order) return { ok: false, error: "not-found" };

  // Determine whether the order is paid/terminal.
  const isPaid = !!(
    order.paypalCaptureId || PAID_ORDER_STATUSES.has(order.status)
  );

  // If the link was marked used but the order is NOT yet paid,
  // treat as "used" (terminal but not receipt-worthy).
  if (link.usedAt && !isPaid) return { ok: false, error: "used" };

  // Paid orders always return the full view (skip expiry check — customer deserves receipt).
  if (!isPaid) {
    if (link.expiresAt < new Date()) return { ok: false, error: "expired" };
    if (!LIVE_ORDER_STATUSES.has(order.status)) {
      return { ok: false, error: "already-paid" };
    }
  }

  // Phase 20 (20-06): hydrate order_items — manual multi-query (no LATERAL per MariaDB quirk).
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  // Phase 20 (20-06): hydrate payment_proofs — latest first.
  const proofs = await db
    .select()
    .from(paymentProofs)
    .where(eq(paymentProofs.orderId, order.id))
    .orderBy(desc(paymentProofs.createdAt));

  // Coupon redemptions are stored in a separate audit table; sum across rows
  // so the totals card can show "Discount −RM X" when any coupon applied.
  const [redemptionTotal] = await db
    .select({ sum: sql<string>`COALESCE(SUM(${couponRedemptions.amountApplied}), 0)` })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.orderId, order.id));
  const discountAmount = Number(redemptionTotal?.sum ?? 0).toFixed(2);

  return {
    ok: true,
    paid: isPaid,
    link: { id: link.id, token: link.token, expiresAt: link.expiresAt },
    order: {
      id: order.id,
      orderNumber: shortOrderNumber(order.id),
      customItemName: order.customItemName ?? null,
      customItemDescription: order.customItemDescription ?? null,
      customImages: ensureImagesArray(order.customImages),
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      shippingServiceName: order.shippingServiceName ?? null,
      shippingServiceCode: order.shippingServiceCode ?? null,
      discountAmount,
      totalAmount: order.totalAmount,
      currency: order.currency,
      paymentMethod: order.paymentMethod ?? null,
      status: order.status,
    },
    orderItems: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      productImage: item.productImage ?? null,
      variantLabel: item.variantLabel ?? null,
      configurationData: item.configurationData ?? null,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    paymentProofs: proofs.map((p) => ({
      id: p.id,
      imageUrl: p.imageUrl,
      thumbnailUrl: p.thumbnailUrl ?? null,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      uploadedBy: p.uploadedBy,
      status: p.status,
      adminNote: p.adminNote ?? null,
      createdAt: p.createdAt,
    })),
  };
}

// ============================================================================
// Phase 20 (20-06) — Public bank-transfer slip upload action
//
// D-25: PUBLIC ACTION — token + status validation is the ONLY gate (no admin session).
// D-23: paymentLinks.usedAt is NOT set here — only on transition to `paid`.
// D-10: File caps (10 MB + MIME allowlist) enforced via writePaymentProof.
// ============================================================================

export type UploadPaymentProofByTokenResult =
  | { ok: true; proofId: string }
  | { ok: false; error: string };

/**
 * Public action for customers to upload a bank-transfer payment slip.
 * Called from /payment-links/[token] — no admin auth required (D-25).
 *
 * Token + status validation is the FIRST thing this function does.
 * File caps are enforced inside writePaymentProof (D-10).
 * paymentLinks.usedAt is never touched here (D-23).
 */
export async function uploadPaymentProofByToken(
  token: string,
  formData: FormData,
): Promise<UploadPaymentProofByTokenResult> {
  // ── Step 1: Token validation (MUST be first awaits — D-25) ─────────────────
  if (!token || typeof token !== "string" || token.length > 64) {
    return { ok: false, error: "Invalid or expired link." };
  }

  const link = await db.query.paymentLinks.findFirst({
    where: eq(paymentLinks.token, token),
  });

  if (!link) {
    return { ok: false, error: "Invalid or expired link." };
  }
  if (link.usedAt !== null) {
    return { ok: false, error: "Invalid or expired link." };
  }
  if (link.expiresAt < new Date()) {
    return { ok: false, error: "Invalid or expired link." };
  }

  // ── Step 2: Order status validation ────────────────────────────────────────
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, link.orderId),
  });

  if (!order) {
    return { ok: false, error: "Order not accepting payment proofs." };
  }
  // Only `awaiting_customer` allows a new slip upload (D-25).
  if (order.status !== "awaiting_customer") {
    return { ok: false, error: "Order not accepting payment proofs." };
  }

  // ── Step 3: Extract file from formData ─────────────────────────────────────
  // FormData.get returns string | File | null. Reject strings and nulls.
  const fileRaw = formData.get("file");
  if (!fileRaw || typeof fileRaw === "string") {
    return { ok: false, error: "No file provided." };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const file = fileRaw as any as File;

  // ── Step 4: Write file to disk (inherits MIME + size validation from D-10) ─
  const writeResult = await writePaymentProof(order.id, file);
  if (!writeResult.ok) {
    return { ok: false, error: writeResult.error };
  }

  // ── Steps 5–7: DB writes inside a transaction ─────────────────────────────
  // Protects DB consistency (proof row + order status transition together).
  // File orphan on rollback is an acceptable known minor leak per plan spec.
  const proofId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      // Insert payment_proofs row.
      await tx.insert(paymentProofs).values({
        id: proofId,
        orderId: order.id,
        imageUrl: writeResult.imageUrl,
        thumbnailUrl: writeResult.thumbnailUrl ?? null,
        mimeType: writeResult.mimeType,
        sizeBytes: writeResult.sizeBytes,
        uploadedBy: "customer",
        uploadedByUserId: null,
        status: "pending",
      });

      // Transition order: awaiting_customer → awaiting_payment_review (D-20).
      assertValidTransition(order.status as Parameters<typeof assertValidTransition>[0], "awaiting_payment_review");

      await tx
        .update(orders)
        .set({ status: "awaiting_payment_review", paymentMethod: "bank_transfer" })
        .where(eq(orders.id, order.id));

      // paymentLinks.usedAt is NOT set here (D-23).
    });
  } catch (err) {
    console.error("[payment-links] uploadPaymentProofByToken DB transaction failed:", err);
    return { ok: false, error: "Could not save payment proof. Please try again." };
  }

  // Revalidate the public payment-link page so the customer sees the post-upload state.
  revalidatePath(`/payment-links/${token}`, "page");

  return { ok: true, proofId };
}

export type CreatePayPalOrderForLinkResult =
  | { ok: true; paypalOrderId: string }
  | { ok: false; error: string };

export async function createPaymentLinkPayPalOrder({
  token,
}: {
  token: string;
}): Promise<CreatePayPalOrderForLinkResult> {
  // Re-validate token + order on every call (T-07-X-money).
  const view = await getPaymentLinkByToken(token);
  if (!view.ok) {
    return { ok: false, error: `Link ${view.error}.` };
  }
  if (view.paid) {
    return { ok: false, error: "Order is already paid." };
  }

  const orderRow = await db.query.orders.findFirst({
    where: eq(orders.id, view.order.id),
  });
  if (!orderRow) return { ok: false, error: "Order not found." };
  if (orderRow.paypalCaptureId) {
    return { ok: false, error: "Order is already paid." };
  }

  // Server-derived amount — NEVER from client (T-07-X-money).
  const totalStr = orderRow.totalAmount;

  let paypalOrderId: string;
  try {
    const response = await ordersController().createOrder({
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            amount: { currencyCode: PAYPAL_CURRENCY, value: totalStr },
            customId: `MANUAL:${orderRow.id}`,
            description: (orderRow.customItemName ?? "Custom 3D print").slice(
              0,
              127,
            ),
          },
        ],
      },
      prefer: "return=representation",
    });
    paypalOrderId = response.result.id ?? "";
    if (!paypalOrderId) throw new Error("PayPal returned no order ID");
  } catch (err) {
    console.error("[payment-links] createOrder failed:", err);
    return { ok: false, error: "Could not start PayPal checkout." };
  }

  // Persist paypalOrderId so capture step can find this row.
  try {
    await db
      .update(orders)
      .set({ paypalOrderId })
      .where(eq(orders.id, orderRow.id));
  } catch (err) {
    console.error("[payment-links] DB update failed:", err);
    return { ok: false, error: "Could not save PayPal order id." };
  }

  return { ok: true, paypalOrderId };
}

export type CapturePaymentLinkResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; error: string };

export async function capturePaymentLinkPayment({
  token,
  paypalOrderId,
}: {
  token: string;
  paypalOrderId: string;
}): Promise<CapturePaymentLinkResult> {
  if (!paypalOrderId) {
    return { ok: false, error: "Missing PayPal order id." };
  }
  // Re-validate token (T-07-X-money / T-07-X-replay).
  const view = await getPaymentLinkByToken(token);
  if (!view.ok) {
    return { ok: false, error: `Link ${view.error}.` };
  }

  // Idempotent — order was already paid (view now returns ok:true + paid:true
  // for paid orders so a second capture call surfaces success immediately).
  if (view.paid) {
    return {
      ok: true,
      orderId: view.order.id,
      orderNumber: view.order.orderNumber,
    };
  }

  const orderRow = await db.query.orders.findFirst({
    where: eq(orders.id, view.order.id),
  });
  if (!orderRow) return { ok: false, error: "Order not found." };
  if (orderRow.paypalCaptureId) {
    // Idempotent — link already captured.
    return {
      ok: true,
      orderId: orderRow.id,
      orderNumber: shortOrderNumber(orderRow.id),
    };
  }

  // Capture via PayPal SDK.
  let captureId: string | null = null;
  try {
    const response = await ordersController().captureOrder({
      id: paypalOrderId,
      prefer: "return=representation",
    });
    const order = response.result;
    const capture = order?.purchaseUnits?.[0]?.payments?.captures?.[0];
    captureId = capture?.id ?? null;
    if (!captureId || capture?.status !== "COMPLETED") {
      return { ok: false, error: "Payment was not completed." };
    }
  } catch (err) {
    const raw = (() => {
      try {
        return JSON.stringify(err) + String((err as Error)?.message ?? "");
      } catch {
        return String(err ?? "");
      }
    })();
    if (raw.includes("ORDER_ALREADY_CAPTURED")) {
      // Refetch and succeed.
      const refetched = await db.query.orders.findFirst({
        where: eq(orders.paypalOrderId, paypalOrderId),
      });
      if (refetched?.paypalCaptureId) {
        return {
          ok: true,
          orderId: refetched.id,
          orderNumber: shortOrderNumber(refetched.id),
        };
      }
    }
    console.error("[payment-links] captureOrder failed:", err);
    return { ok: false, error: "Could not capture PayPal payment." };
  }

  // Atomic DB update — flip orders.status + record capture id, mark link used.
  try {
    await db
      .update(orders)
      .set({ status: "paid", paypalCaptureId: captureId })
      .where(eq(orders.id, orderRow.id));
    await db
      .update(paymentLinks)
      .set({ usedAt: new Date() })
      .where(eq(paymentLinks.token, token));
  } catch (err) {
    console.error("[payment-links] DB write after capture failed:", err);
    // PayPal already captured — webhook will reconcile if this was transient.
  }

  // Shipping is booked MANUALLY by an admin from /admin/orders/[id] when
  // ready (ops decision 2026-06-01) — do NOT auto-book the courier on payment.

  // Await the order-confirmation email send. Previously fire-and-forget,
  // but Next.js on Node runtime may abort the pending promise after the
  // server action returns to the client — customers stopped receiving
  // confirmations. sendOrderConfirmationEmail catches its own SMTP
  // errors and never throws, so awaiting only adds latency, never risk.
  if (
    orderRow.customerEmail &&
    !orderRow.customerEmail.endsWith("@3dninjaz.local")
  ) {
    try {
      await sendOrderConfirmationEmail(orderRow.id);
    } catch (err) {
      console.error("[payment-links] confirmation email dispatch failed:", err);
    }
  }
  void sendWhatsAppNotification("order_confirmation", orderRow.shippingPhone, {
    customerName: orderRow.shippingName,
    orderNumber: shortOrderNumber(orderRow.id),
    orderUrl: publicUrl(`/orders/${orderRow.id}`),
  }).catch(() => {});
  void sendWhatsAppInvoicePdf(orderRow.id, orderRow.shippingPhone).catch(() => {});

  revalidatePath(`/admin/orders/${orderRow.id}`);
  revalidatePath("/admin/payments");

  return {
    ok: true,
    orderId: orderRow.id,
    orderNumber: shortOrderNumber(orderRow.id),
  };
}
