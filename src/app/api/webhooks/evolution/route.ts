/**
 * Evolution API webhook receiver.
 *
 * Mirrors the resilience pattern of src/app/api/webhooks/delyva/route.ts.
 * ALWAYS returns HTTP 200 — never 500. All errors are swallowed.
 *
 * Handles:
 *   connection.update — persists connection state changes
 *   qrcode.updated    — stamps lastQrAt (panel polls for the QR itself)
 */
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { WHATSAPP_INSTANCE_NAME } from "@/lib/whatsapp/types";
import { updateWhatsappConnectionState } from "@/lib/whatsapp/settings";

const ok200 = NextResponse.json({ ok: true });

/**
 * Constant-time check of the shared webhook secret. Evolution calls this URL
 * with `?secret=<EVOLUTION_WEBHOOK_SECRET>` (set by connectWhatsapp's
 * setWebhook). The endpoint is public, so when the env var is set we REQUIRE a
 * matching secret and silently drop anything else — an unauthenticated POST
 * must not be able to spoof connection/QR state. When unset (not yet
 * configured) we allow + warn, mirroring the Delyva optional-secret pattern.
 */
function isAuthenticated(req: Request): boolean {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!expected) {
    console.warn(
      "[evolution-webhook] EVOLUTION_WEBHOOK_SECRET unset — accepting unsigned callbacks",
    );
    return true;
  }
  const provided =
    new URL(req.url).searchParams.get("secret") ??
    req.headers.get("x-evolution-secret") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  // Auth FIRST — drop unauthenticated callers before touching any state.
  if (!isAuthenticated(req)) {
    return ok200; // silently 200 — do not reveal behaviour to a prober
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return ok200;
  }

  // Instance guard — ignore events from other instances.
  if (body.instance && body.instance !== WHATSAPP_INSTANCE_NAME) {
    return ok200;
  }

  const ev = String(body.event ?? "").toLowerCase();

  // ---------------------------------------------------------------------------
  // connection.update
  // ---------------------------------------------------------------------------
  if (ev === "connection.update") {
    try {
      const data = body.data as Record<string, unknown> | undefined;
      const rawState = data?.state;
      const state: "close" | "connecting" | "open" =
        rawState === "open"
          ? "open"
          : rawState === "connecting"
          ? "connecting"
          : "close";

      // Extract connected JID from various Evolution payload shapes.
      // Evolution sends the JID in body.sender, data.wuid, or data.instance.owner.
      let rawJid: string | undefined;
      if (typeof body.sender === "string") {
        rawJid = body.sender;
      } else if (typeof data?.wuid === "string") {
        rawJid = data.wuid;
      } else {
        const inst = data?.instance as Record<string, unknown> | undefined;
        if (typeof inst?.owner === "string") rawJid = inst.owner;
      }

      // Strip @s.whatsapp.net and :NN suffix, keep digits only.
      let number: string | undefined;
      if (rawJid) {
        const stripped = rawJid
          .replace(/@s\.whatsapp\.net$/, "")
          .replace(/:\d+$/, "")
          .replace(/\D/g, "");
        if (stripped.length >= 10) number = stripped;
      }

      await updateWhatsappConnectionState(state, number ?? undefined);
    } catch (err) {
      console.error("[evolution-webhook] connection.update handling failed:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // qrcode.updated — stamp lastQrAt; panel polls for the actual QR code
  // ---------------------------------------------------------------------------
  if (ev === "qrcode.updated") {
    try {
      await updateWhatsappConnectionState("connecting", undefined, { qr: true });
    } catch (err) {
      console.error("[evolution-webhook] qrcode.updated handling failed:", err);
    }
  }

  return ok200;
}
