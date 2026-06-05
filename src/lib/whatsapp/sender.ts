/**
 * Unified best-effort WhatsApp notification sender (server-only).
 *
 * NOT "use server". Import this from call sites (not from "use server" files
 * directly — those files call this as a regular async function).
 *
 * NEVER throws. NEVER blocks the caller. All errors are console.error'd only.
 * Call with: void sendWhatsAppNotification(...).catch(() => {})
 */
import "server-only";
import type { WhatsappEventKey } from "@/lib/whatsapp/events";
import { normalizeMsisdn, renderWhatsappTemplate } from "@/lib/whatsapp/events";
import { getWhatsappStateFresh, getWhatsappNotification } from "@/lib/whatsapp/settings";
import { sendText, sendMedia } from "@/lib/whatsapp/client";
import { renderInvoicePdfBase64 } from "@/lib/pdf/render-invoice";
import { formatOrderNumber } from "@/lib/orders";

/**
 * Send a WhatsApp notification for a given event key to a phone number.
 *
 * Steps:
 * 1. Normalize phone — if invalid, no-op.
 * 2. Read fresh state — if master toggle off or not connected, no-op.
 * 3. Read notification config — if event disabled, no-op.
 * 4. Render template with vars.
 * 5. Send via Evolution.
 *
 * All wrapped in a try/catch that only console.error's — NEVER throws.
 */
/**
 * Send the invoice PDF for a given order over WhatsApp to the provided phone.
 *
 * Gates on the same connection + enabled checks as sendWhatsAppNotification so
 * it sends only when WhatsApp is live and notifications are turned on.
 *
 * Best-effort: NEVER throws. Wraps everything in try/catch.
 */
export async function sendWhatsAppInvoicePdf(
  orderId: string,
  phone: string | null | undefined,
): Promise<void> {
  try {
    const number = normalizeMsisdn(phone);
    if (!number) return;

    const s = await getWhatsappStateFresh();
    if (!s.notificationsEnabled) return;
    if (s.state !== "open") return;

    const base64 = await renderInvoicePdfBase64(orderId);
    if (!base64) return;

    const fileName = `invoice-${formatOrderNumber(orderId)}.pdf`;
    await sendMedia({ number, base64, fileName });
  } catch (err) {
    console.error("[whatsapp] sendWhatsAppInvoicePdf failed", orderId, err);
  }
}

export async function sendWhatsAppNotification(
  eventKey: WhatsappEventKey,
  phone: string | null | undefined,
  vars: Record<string, unknown>,
): Promise<void> {
  try {
    const number = normalizeMsisdn(phone);
    if (!number) return;

    const s = await getWhatsappStateFresh();
    if (!s.notificationsEnabled) return;
    if (s.state !== "open") return;

    const cfg = await getWhatsappNotification(eventKey);
    if (!cfg || !cfg.enabled) return;

    const text = renderWhatsappTemplate(cfg.template, vars);
    if (!text.trim()) return;

    const sent = await sendText({ number, text });
    if (!sent) {
      console.error("[whatsapp] sendText returned false", { eventKey, number });
    }
  } catch (err) {
    console.error("[whatsapp] sendWhatsAppNotification failed", eventKey, err);
  }
}
