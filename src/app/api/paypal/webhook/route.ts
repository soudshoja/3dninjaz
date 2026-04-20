import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPayPalEnvironment } from "@/lib/paypal";
import { Environment } from "@paypal/paypal-server-sdk";

/**
 * PayPal webhook route handler (D3-21, T-03-11).
 *
 * MUST be a Route Handler (not a server action) because PayPal POSTs directly
 * to a public URL with its own headers that server actions cannot receive.
 *
 * Security contract:
 *   - The signature is verified via PayPal's POST /v1/notifications/verify-webhook-signature
 *     API BEFORE any DB write.
 *   - On FAILURE we return HTTP 400 and write NOTHING to the DB.
 *   - Reconciliation is idempotent: we only update the order row if
 *     orders.paypalCaptureId is still null (matches D3-09 capture idempotency).
 *   - Webhook body sizes are tiny; we read it as text once and pass that exact
 *     string (unchanged) to PayPal for verification. Re-serializing via
 *     JSON.stringify(JSON.parse(...)) would change whitespace/escaping and
 *     break the signature check.
 */

function paypalApiBase(): string {
  return getPayPalEnvironment() === Environment.Production
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function resolveWebhookCredentials(): {
  clientId: string;
  clientSecret: string;
  webhookId: string;
} | null {
  const isLive = getPayPalEnvironment() === Environment.Production;
  const clientId = isLive
    ? process.env.PAYPAL_CLIENT_ID
    : process.env.PAYPAL_CLIENT_ID_SANDBOX ?? process.env.PAYPAL_CLIENT_ID;
  const clientSecret = isLive
    ? process.env.PAYPAL_CLIENT_SECRET
    : process.env.PAYPAL_CLIENT_SECRET_SANDBOX ??
      process.env.PAYPAL_CLIENT_SECRET;
  const webhookId = isLive
    ? process.env.PAYPAL_WEBHOOK_ID
    : process.env.PAYPAL_WEBHOOK_ID_SANDBOX ?? process.env.PAYPAL_WEBHOOK_ID;
  if (!clientId || !clientSecret || !webhookId) return null;
  return { clientId, clientSecret, webhookId };
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal OAuth failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("PayPal OAuth returned no access_token");
  }
  return json.access_token;
}

type VerifyResult = "SUCCESS" | "FAILURE";

async function verifyWebhookSignature(
  req: NextRequest,
  rawBody: string,
): Promise<VerifyResult> {
  const creds = resolveWebhookCredentials();
  if (!creds) {
    console.error(
      "[paypal webhook] missing PAYPAL_CLIENT_ID / SECRET / WEBHOOK_ID env",
    );
    return "FAILURE";
  }

  let token: string;
  try {
    token = await getAccessToken(creds.clientId, creds.clientSecret);
  } catch (err) {
    console.error("[paypal webhook] token fetch failed:", err);
    return "FAILURE";
  }

  let webhookEvent: unknown;
  try {
    webhookEvent = JSON.parse(rawBody);
  } catch {
    return "FAILURE";
  }

  const body = {
    auth_algo: req.headers.get("paypal-auth-algo") ?? "",
    cert_url: req.headers.get("paypal-cert-url") ?? "",
    transmission_id: req.headers.get("paypal-transmission-id") ?? "",
    transmission_sig: req.headers.get("paypal-transmission-sig") ?? "",
    transmission_time: req.headers.get("paypal-transmission-time") ?? "",
    webhook_id: creds.webhookId,
    webhook_event: webhookEvent,
  };

  let res: Response;
  try {
    res = await fetch(
      `${paypalApiBase()}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    console.error("[paypal webhook] verify request failed:", err);
    return "FAILURE";
  }

  if (!res.ok) {
    return "FAILURE";
  }
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === "SUCCESS" ? "SUCCESS" : "FAILURE";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const status = await verifyWebhookSignature(req, rawBody);
  if (status !== "SUCCESS") {
    // T-03-11 mitigation: reject unsigned/tampered webhooks with 400 and
    // NO DB write. No leak of why verification failed.
    console.warn("[paypal webhook] signature verification failed");
    return NextResponse.json(
      { error: "signature verification failed" },
      { status: 400 },
    );
  }

  let event: {
    event_type?: string;
    resource?: {
      id?: string;
      supplementary_data?: {
        related_ids?: { order_id?: string; capture_id?: string };
      };
      links?: Array<{ rel: string; href: string }>;
      seller_payable_breakdown?: {
        total_refunded_amount?: { value?: string; currency_code?: string };
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventType = event.event_type ?? "";
  // Do NOT log the full payload (T-03-20) — only the event type.
  console.info(`[paypal webhook] verified event: ${eventType}`);

  // ==========================================================================
  // Phase 7 (07-05) — PAYMENT.CAPTURE.REFUNDED handler.
  //
  // Idempotent on orders.refundedAmount via GREATEST(local, paypal_total) so
  // replays do not double-count (T-07-05-replay). PayPal supplies the running
  // total in resource.seller_payable_breakdown.total_refunded_amount.
  //
  // Capture id resolution order:
  //   1. resource.supplementary_data.related_ids.capture_id (PayPal canonical)
  //   2. resource.links[?rel='up'].href tail (fallback)
  // ==========================================================================
  if (eventType === "PAYMENT.CAPTURE.REFUNDED") {
    let captureId: string | null =
      event.resource?.supplementary_data?.related_ids?.capture_id ?? null;
    if (!captureId) {
      const upLink = (event.resource?.links ?? []).find(
        (l) => l.rel === "up",
      );
      if (upLink?.href) {
        const tail = upLink.href.split("/").pop();
        if (tail) captureId = tail;
      }
    }
    if (!captureId) {
      return NextResponse.json({ ok: true, ignored: "no-capture-id" });
    }
    const totalRefunded = parseFloat(
      event.resource?.seller_payable_breakdown?.total_refunded_amount?.value ??
        "0",
    );
    if (!Number.isFinite(totalRefunded) || totalRefunded <= 0) {
      return NextResponse.json({ ok: true, ignored: "zero-refund" });
    }
    const row = await db.query.orders.findFirst({
      where: eq(orders.paypalCaptureId, captureId),
    });
    if (!row) {
      return NextResponse.json({ ok: true, ignored: "no-local-order" });
    }
    const localRefunded = parseFloat(row.refundedAmount);
    const target = Math.max(localRefunded, totalRefunded);
    if (target > localRefunded + 0.001) {
      const total = parseFloat(row.totalAmount);
      const fullyRefunded = target + 0.001 >= total;
      await db
        .update(orders)
        .set({
          refundedAmount: target.toFixed(2),
          ...(fullyRefunded ? { status: "cancelled" as const } : {}),
        })
        .where(eq(orders.id, row.id));
    }
    return NextResponse.json({ ok: true });
  }

  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    const captureId = event.resource?.id;
    // supplementary_data.related_ids.order_id links the capture to the
    // PayPal order we stored as orders.paypalOrderId at create time.
    const paypalOrderId =
      event.resource?.supplementary_data?.related_ids?.order_id;

    if (captureId && paypalOrderId) {
      const existing = await db.query.orders.findFirst({
        where: eq(orders.paypalOrderId, paypalOrderId),
      });
      if (existing && !existing.paypalCaptureId) {
        // Idempotent reconciliation (D3-09, T-03-13): only write if we
        // have not already captured via the user-facing path.
        await db
          .update(orders)
          .set({ status: "paid", paypalCaptureId: captureId })
          .where(eq(orders.id, existing.id));
      }
    }
  }
  // Other event types (CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.DENIED, ...)
  // are acknowledged but not written to the DB in v1 (T-03-18 accept).

  return NextResponse.json({ received: true }, { status: 200 });
}
