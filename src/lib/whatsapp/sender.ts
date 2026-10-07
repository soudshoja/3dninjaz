/**
 * Unified WhatsApp notification sender (server-only) — ENQUEUE-ONLY.
 *
 * NOT "use server". Import this from call sites (not from "use server" files
 * directly — those files call this as a regular async function).
 *
 * These functions no longer talk to the gateway. They render the message
 * (text is frozen at enqueue time — D-3) and persist it to `whatsapp_outbox`;
 * the dispatcher (src/lib/whatsapp/dispatcher.ts) delivers it asynchronously
 * with retries. Crucially they no longer gate on `connection_state === "open"`
 * — that signal proved untrustworthy during the 32.6h gateway outage, and a
 * gated send left no record. A disconnected gateway now simply means rows
 * wait in the queue and retry.
 *
 * NEVER throws. NEVER blocks the caller on the network. Errors are
 * console.error'd only.
 * Call with: void sendWhatsAppNotification(...).catch(() => {})
 */
import "server-only";
import type { WhatsappEventKey } from "@/lib/whatsapp/events";
import { normalizeMsisdn, renderWhatsappTemplate } from "@/lib/whatsapp/events";
import { getWhatsappStateFresh, getWhatsappNotification } from "@/lib/whatsapp/settings";
import { enqueueOutbox } from "@/lib/whatsapp/outbox";
import { sendText, sendMedia } from "@/lib/whatsapp/client";
import { renderInvoicePdfBase64 } from "@/lib/pdf/render-invoice";
import { formatOrderNumber } from "@/lib/orders";

export type SendOpts = {
  /**
   * Explicit suffix for the idempotency key. Set this for intentional
   * resends (e.g. admin "resend invoice") so they are not swallowed by
   * dedupe.
   */
  dedupeSuffix?: string;
};

/**
 * Enqueue the invoice PDF for a given order to the provided phone.
 *
 * The PDF is NOT rendered here (D-3): a base64 PDF is hundreds of KB and is
 * deterministically re-derivable from the order, so the outbox row stores
 * payload_kind='invoice_pdf' + payload_ref=<orderId> and the dispatcher
 * renders it at send time.
 *
 * Best-effort: NEVER throws.
 */
export async function sendWhatsAppInvoicePdf(
  orderId: string,
  phone: string | null | undefined,
  opts?: SendOpts,
): Promise<void> {
  try {
    const number = normalizeMsisdn(phone);
    if (!number) return;

    // Only the master toggle is checked. connection_state is deliberately
    // NOT consulted — see module header.
    const s = await getWhatsappStateFresh();
    if (!s.notificationsEnabled) return;

    const q = await enqueueOutbox({
      eventKey: "invoice_pdf",
      orderId,
      recipient: number,
      payloadKind: "invoice_pdf",
      payloadRef: orderId,
      dedupeSuffix: opts?.dedupeSuffix ?? null,
    });
    if (q.tableMissing) {
      // Code deployed before the migration: fall back to the pre-outbox direct
      // send rather than dropping the message (loud Error: already logged).
      const base64 = await renderInvoicePdfBase64(orderId);
      if (base64) {
        await sendMedia({
          number,
          base64,
          fileName: `invoice-${formatOrderNumber(orderId)}.pdf`,
        });
      }
    }
  } catch (err) {
    console.error("[whatsapp] sendWhatsAppInvoicePdf failed", orderId, err);
  }
}

/**
 * Enqueue a WhatsApp notification for a given event key.
 *
 * Steps:
 * 1. Normalize phone — if invalid, no-op.
 * 2. Read fresh state — if master toggle off, no-op.
 * 3. Read notification config — if event disabled, no-op (a disabled event
 *    must not queue).
 * 4. Render template with vars (frozen at enqueue time).
 * 5. Enqueue (idempotent via DB unique key).
 *
 * All wrapped in a try/catch that only console.error's — NEVER throws.
 */
export async function sendWhatsAppNotification(
  eventKey: WhatsappEventKey,
  phone: string | null | undefined,
  vars: Record<string, unknown>,
  opts?: SendOpts,
): Promise<void> {
  try {
    const number = normalizeMsisdn(phone);
    if (!number) return;

    const s = await getWhatsappStateFresh();
    if (!s.notificationsEnabled) return;

    const cfg = await getWhatsappNotification(eventKey);
    if (!cfg || !cfg.enabled) return;

    const text = renderWhatsappTemplate(cfg.template, vars);
    if (!text.trim()) return;

    const orderId =
      typeof vars.orderId === "string" && vars.orderId ? vars.orderId : null;

    // Dedupe-correctness fallback: when a call site has not (yet) plumbed
    // `orderId` into vars, the '-' sentinel would make the key
    // "<event>:-:<phone>" — silently swallowing a repeat customer's SECOND
    // order notification forever. Fall back to the human order number so two
    // different orders never share a key. (Not a substitute for orderId: the
    // admin view cannot link the row to its order without it.)
    const orderNumber =
      typeof vars.orderNumber === "string" && vars.orderNumber
        ? vars.orderNumber
        : null;
    const parts: string[] = [];
    if (!orderId && orderNumber) parts.push(`n=${orderNumber}`);
    if (opts?.dedupeSuffix) parts.push(opts.dedupeSuffix);

    const q = await enqueueOutbox({
      eventKey,
      orderId,
      recipient: number,
      payloadKind: "text",
      payloadText: text,
      dedupeSuffix: parts.length ? parts.join(":") : null,
    });
    if (q.tableMissing) {
      // Code deployed before the migration: fall back to the pre-outbox direct
      // send rather than dropping the message (loud Error: already logged).
      // Only for a missing table - any other DB error just stays loud.
      await sendText({ number, text });
    }
  } catch (err) {
    console.error("[whatsapp] sendWhatsAppNotification failed", eventKey, err);
  }
}
