import type { NextRequest } from "next/server";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

// ============================================================================
// Plan 05-02 — public analytics ingest endpoint.
//
// Q-05-03 resolution: client-side onClick tracking → DB events table.
// No external analytics SaaS for v1.
//
// Threat mitigations:
//   - T-05-02-PDPA: IP is sha256-hashed before insert; raw IP never stored
//   - T-05-02-DoS: in-memory rate limit (100 req/min per ipHash); 429 beyond
//   - T-05-02-tampering: Zod-validated event enum; unknown events → 400
//   - T-05-02-events-flood: lightweight indexes; nightly cleanup is a TODO
// ============================================================================

const trackSchema = z.object({
  event: z.enum(["page_view", "add_to_bag", "checkout_started"]),
  sessionId: z.string().max(64).optional(),
  path: z.string().max(200).optional(),
});

const RATE_LIMIT_PER_MIN = 100;
const RATE_WINDOW_MS = 60_000;
const IP_SALT = process.env.EVENTS_IP_SALT ?? "3dn-events-salt-v1";

// In-memory rate limiter — fine for v1 single Node instance. Move to Redis
// when we go multi-replica.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateLimit(ipHash: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ipHash);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ipHash, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_PER_MIN) return false;
  bucket.count += 1;
  return true;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(`${IP_SALT}:${ip}`).digest("hex");
}

function clientIp(req: NextRequest): string {
  // x-forwarded-for can be a comma-separated chain when behind a proxy
  // (cPanel LSWS adds one). Take the first non-empty entry.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "0.0.0.0";
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid" }),
      { status: 400 },
    );
  }

  const ip = clientIp(req);
  const ipHash = hashIp(ip);

  if (!rateLimit(ipHash)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
    });
  }

  try {
    await db.insert(events).values({
      id: randomUUID(),
      event: parsed.data.event,
      sessionId: parsed.data.sessionId ?? null,
      ipHash,
      path: parsed.data.path ?? null,
    });
  } catch (err) {
    // Fire-and-forget: an analytics ingest failure must never break the
    // user's flow. Log + return 200 so the client doesn't retry forever.
    console.error("[events/track] insert failed:", err);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
