import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { runDeliverySync } from "@/lib/delivery-sync";

// Internal cron endpoint. Secret in the x-delivery-sync-secret HEADER only
// (never the query string). Fails closed when DELIVERY_SYNC_SECRET is unset.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretMatches(got: string, expected: string): boolean {
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.DELIVERY_SYNC_SECRET;
  if (!expected) {
    console.error("[delivery-sync] DELIVERY_SYNC_SECRET is not set — refusing all requests");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const got = req.headers.get("x-delivery-sync-secret") ?? "";
  if (!got || !secretMatches(got, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDeliverySync();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[delivery-sync] run failed:", (err as Error).message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
