import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderShipments, orders } from "@/lib/db/schema";
import { sendOrderDeliveredEmail } from "@/actions/send-emails";
import { formatOrderNumber } from "@/lib/orders";
import { getDelyvaWebhookSecret } from "@/lib/delyva";

// ============================================================================
// Phase 9 (09-01) — Delyva webhook receiver.
//
// Security contract (see .claude/skills/delivery-skills/references/webhooks.md):
//   - MUST verify HMAC-SHA256 over the raw body with DELYVA_API_SECRET using
//     crypto.timingSafeEqual BEFORE trusting the payload.
//   - Parse with await req.text() — not req.json() — because JSON.parse
//     normalises whitespace and would invalidate the signature.
//   - Respond 200 within 30s or Delyva retries hourly up to 10 times. So we
//     ack the work after a minimal DB write; any heavy lifting
//     (customer email, analytics) is deferred to follow-up phases.
//
// Idempotency:
//   - Key = `${data.id}:${data.statusCode}:${timestamp}`.
//   - In-process Set keeps the most recent ~2000 keys. Good enough at our
//     volume (<100 parcels/day). For higher volumes this should move to
//     Redis / a webhook_events table — see FU-02.
// ============================================================================

// NB: runs on the Node runtime by default (uses crypto); explicit for clarity.
export const runtime = "nodejs";
// Never static-cache the response.
export const dynamic = "force-dynamic";

const SEEN_KEYS = new Set<string>();
const SEEN_ORDER: string[] = [];
const SEEN_MAX = 2000;

function remember(key: string): boolean {
  if (SEEN_KEYS.has(key)) return false;
  SEEN_KEYS.add(key);
  SEEN_ORDER.push(key);
  while (SEEN_ORDER.length > SEEN_MAX) {
    const drop = SEEN_ORDER.shift();
    if (drop) SEEN_KEYS.delete(drop);
  }
  return true;
}

function verifySignature(raw: string, got: string, secret: string): boolean {
  if (!got || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("base64");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type DelyvaWebhookPayload = {
  event?: string;
  timestamp?: string;
  data?: {
    id?: number | string;
    referenceNo?: string;
    consignmentNo?: string;
    trackingNo?: string;
    statusCode?: number;
    statusMessage?: string;
    personnel?: { name?: string; phone?: string };
  };
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const got = req.headers.get("x-delyvax-hmac-sha256") ?? "";
  const secret = getDelyvaWebhookSecret();

  if (!verifySignature(raw, got, secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: DelyvaWebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const event = req.headers.get("x-delyvax-event") ?? payload.event ?? "";
  const data = payload.data ?? {};
  const idRaw = data.id;

  // Idempotency
  const idempKey = `${idRaw ?? ""}:${data.statusCode ?? ""}:${payload.timestamp ?? ""}`;
  if (!remember(idempKey)) {
    return NextResponse.json({ ok: true, dup: true });
  }

  // Only tracking-state events touch our mirror. order.failed + order.created
  // we ack + log for now — follow-ups can expand this.
  if (
    idRaw !== undefined &&
    (event === "order_tracking.change" ||
      event === "order_tracking.update" ||
      event === "order.updated")
  ) {
    try {
      const delyvaOrderId = String(idRaw);
      const eventAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

      await db
        .update(orderShipments)
        .set({
          statusCode: data.statusCode ?? undefined,
          statusMessage: data.statusMessage ?? undefined,
          consignmentNo: data.consignmentNo ?? undefined,
          trackingNo: data.trackingNo ?? undefined,
          personnelName: data.personnel?.name ?? undefined,
          personnelPhone: data.personnel?.phone ?? undefined,
          lastTrackingEventAt: eventAt,
        })
        .where(eq(orderShipments.delyvaOrderId, delyvaOrderId));

      // Send delivery confirmation email when statusCode === 400 (delivered)
      if (data.statusCode === 400) {
        try {
          // Find the order associated with this shipment to get customer info
          const shipment = await db
            .select({
              orderId: orderShipments.orderId,
            })
            .from(orderShipments)
            .where(eq(orderShipments.delyvaOrderId, delyvaOrderId))
            .limit(1);

          if (shipment.length > 0) {
            const order = await db
              .select({
                id: orders.id,
                customerEmail: orders.customerEmail,
                shippingName: orders.shippingName,
              })
              .from(orders)
              .where(eq(orders.id, shipment[0].orderId))
              .limit(1);

            if (order.length > 0) {
              void sendOrderDeliveredEmail({
                customerEmail: order[0].customerEmail,
                customerName: order[0].shippingName,
                orderNumber: formatOrderNumber(order[0].id),
                orderId: order[0].id,
              }).catch((err) =>
                console.error("[delyva-webhook] delivery email failed:", err)
              );
            }
          }
        } catch (err) {
          console.error("[delyva-webhook] failed to send delivery email:", err);
          // Don't block the webhook response
        }
      }
    } catch (err) {
      console.error("delyva webhook DB update failed", err);
      // Return 200 anyway — retrying won't fix a schema/DB issue and we have
      // refreshShipmentStatus() as a manual recovery.
    }
  }

  if (event === "order.failed") {
    console.error("delyva order.failed", {
      id: idRaw,
      statusMessage: data.statusMessage,
    });
  }

  return NextResponse.json({ ok: true });
}
