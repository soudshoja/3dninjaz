"use server";

import { db } from "@/lib/db";
import { orders, paymentLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ordersController, PAYPAL_CURRENCY } from "@/lib/paypal";
import { CheckoutPaymentIntent } from "@paypal/paypal-server-sdk";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { revalidatePath } from "next/cache";

/**
 * Phase 7 (07-03) — PUBLIC payment-link actions.
 *
 * NO requireAdmin() / requireUser() — anyone with the token can pay.
 * The token itself is the credential. Server NEVER trusts a client-sent
 * amount: every PayPal call re-derives `orders.totalAmount` keyed by the
 * token row (T-07-X-money).
 *
 * URL contains ONLY the token — never email/name/phone in URL or query
 * (T-07-X-PII-on-payment-link).
 */

export type PaymentLinkView = {
  ok: true;
  link: { id: string; token: string; expiresAt: Date };
  order: {
    id: string;
    orderNumber: string;
    customItemName: string | null;
    customItemDescription: string | null;
    customImages: string[];
    totalAmount: string;
    currency: string;
  };
};

export type PaymentLinkError = {
  ok: false;
  error: "expired" | "used" | "not-found" | "already-paid";
};

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
  if (link.usedAt) return { ok: false, error: "used" };
  if (link.expiresAt < new Date()) return { ok: false, error: "expired" };

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, link.orderId),
  });
  if (!order) return { ok: false, error: "not-found" };
  if (order.paypalCaptureId) return { ok: false, error: "already-paid" };

  return {
    ok: true,
    link: { id: link.id, token: link.token, expiresAt: link.expiresAt },
    order: {
      id: order.id,
      orderNumber: shortOrderNumber(order.id),
      customItemName: order.customItemName ?? null,
      customItemDescription: order.customItemDescription ?? null,
      customImages: ensureImagesArray(order.customImages),
      totalAmount: order.totalAmount,
      currency: order.currency,
    },
  };
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
    if (view.error === "already-paid") {
      // Surface success-ish — admin marked paid already.
      const orderRow = await db.query.orders.findFirst({
        where: eq(orders.paypalOrderId, paypalOrderId),
      });
      if (orderRow) {
        return {
          ok: true,
          orderId: orderRow.id,
          orderNumber: shortOrderNumber(orderRow.id),
        };
      }
    }
    return { ok: false, error: `Link ${view.error}.` };
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

  // Fire-and-forget order confirmation email if customer has a real email
  // (skip sentinel @3dninjaz.local addresses).
  if (
    orderRow.customerEmail &&
    !orderRow.customerEmail.endsWith("@3dninjaz.local")
  ) {
    void sendOrderConfirmationEmail(orderRow.id).catch((err) =>
      console.error("[payment-links] confirmation email dispatch failed:", err),
    );
  }

  revalidatePath(`/admin/orders/${orderRow.id}`);
  revalidatePath("/admin/payments");

  return {
    ok: true,
    orderId: orderRow.id,
    orderNumber: shortOrderNumber(orderRow.id),
  };
}
