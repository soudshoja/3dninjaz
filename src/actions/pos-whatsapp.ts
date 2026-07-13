"use server";
/**
 * POS-specific WhatsApp notification actions.
 *
 * Two actions:
 *   sendPosPaymentLinkWhatsApp(orderId)
 *     - Generates (or reuses) a payment link for the order via generatePaymentLink.
 *     - Fires sendWhatsAppNotification("order_pending", phone, { ...vars, paymentLink }).
 *     - Returns { ok, link? } | { ok: false, error }.
 *
 *   sendPosInvoicePdfWhatsApp(orderId)
 *     - Fires sendWhatsAppInvoicePdf(orderId, phone).
 *     - Returns { ok } | { ok: false, error }.
 *
 * Both actions:
 *   - requireAdmin() FIRST await (CVE-2025-29927 mitigation).
 *   - Pull the customer phone from the order row server-side — never trust client input.
 *   - Go through sendWhatsAppNotification / sendWhatsAppInvoicePdf so the
 *     admin's Notification Center toggles (notificationsEnabled + per-event enabled
 *     + connection open) are respected.
 *   - Best-effort: never throw, never block POS flow.
 *
 * NOTE: "use server" files may only export async functions.
 *       All types live in src/lib/whatsapp/events.ts or local inline.
 */

import { requireAdmin } from "@/lib/auth-helpers";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generatePaymentLink } from "@/actions/admin-manual-orders";
import { sendWhatsAppNotification, sendWhatsAppInvoicePdf } from "@/lib/whatsapp/sender";
import { formatOrderNumber } from "@/lib/orders";
import { publicOrigin } from "@/lib/public-url";

// ─── sendPosPaymentLinkWhatsApp ───────────────────────────────────────────────

/**
 * Generate a payment link for the given POS order and fire the order_pending
 * WhatsApp notification to the customer.
 *
 * Returns { ok: true, link } on success, { ok: false, error } on failure.
 * The WhatsApp send is best-effort; if it silently no-ops (connection down,
 * notification disabled) the link is still returned as ok.
 */
export async function sendPosPaymentLinkWhatsApp(
  orderId: string,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const { db, tenant } = await requireAdmin();
  const publicLinkBase = process.env.NEXT_PUBLIC_BASE_URL ?? publicOrigin(tenant);

  // Fetch the order to get customer phone + name + total.
  // Do this server-side; never trust a phone number from the client.
  const [orderRow] = await db
    .select({
      shippingPhone: orders.shippingPhone,
      shippingName: orders.shippingName,
      totalAmount: orders.totalAmount,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) {
    return { ok: false, error: "Order not found." };
  }

  // Generate the payment link (uses the existing generatePaymentLink action).
  const linkResult = await generatePaymentLink({ orderId });
  if (!linkResult.ok) {
    return { ok: false, error: linkResult.error };
  }

  const paymentLink = `${publicLinkBase}/payment-links/${linkResult.token}`;
  const orderNumber = formatOrderNumber(orderId);

  // Fire the order_pending WhatsApp notification — best-effort, no await on errors.
  void sendWhatsAppNotification("order_pending", orderRow.shippingPhone, {
    customerName: orderRow.shippingName ?? "",
    orderNumber,
    orderTotal: orderRow.totalAmount ?? "",
    paymentLink,
  });

  return { ok: true, link: linkResult.url };
}

// ─── sendPosInvoicePdfWhatsApp ────────────────────────────────────────────────

/**
 * Send the invoice PDF for the given POS order to the customer via WhatsApp.
 *
 * Returns { ok: true } on success (or when the send is a silent no-op because
 * the notification center is off / connection is closed).
 * Returns { ok: false, error } only on hard errors (order not found, DB failure).
 */
export async function sendPosInvoicePdfWhatsApp(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { db } = await requireAdmin();

  const [orderRow] = await db
    .select({ shippingPhone: orders.shippingPhone })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) {
    return { ok: false, error: "Order not found." };
  }

  // Best-effort — sendWhatsAppInvoicePdf never throws.
  await sendWhatsAppInvoicePdf(orderId, orderRow.shippingPhone);

  return { ok: true };
}
