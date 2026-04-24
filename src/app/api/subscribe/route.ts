import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth-helpers";
import { sendNewsletterWelcomeEmail } from "@/actions/send-emails";
import { checkRateLimit } from "@/lib/rate-limit";

/** Derive a stable per-client key from forwarded headers. Hashed so raw IPs
 *  never enter the rate-limit bucket Map. */
function ipHashFromRequest(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  const raw = fwd || real || "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/subscribe — newsletter signup from the storefront footer (also
 * reusable from checkout / popups via the `source` field).
 *
 * Contract:
 *   - Always returns `{ ok: true }` on valid submission — the specific branch
 *     (`already` / `reactivated`) is included as a hint so the UI can tailor
 *     the success message. Error paths return `{ ok: false, error }` with the
 *     appropriate status code.
 *   - Obvious bot input (`email` containing multiple `@`, or failing basic
 *     Zod validation) silently returns `{ ok: true }` with no DB write — this
 *     mirrors the pattern for spam honeypots that confuse scrapers rather
 *     than expose whether the backend accepted the payload.
 *
 * NB: rate-limiting is intentionally out of scope for v1 (no shared infra).
 * Follow-up task: add IP-based token-bucket in middleware once we stand up
 * Upstash or Redis.
 */

const Body = z.object({
  email: z.string().email().max(254),
  source: z.string().max(50).optional(),
});

/** Crude bot check — legitimate emails have exactly one `@`. */
function looksLikeGarbage(email: string): boolean {
  const atCount = email.split("@").length - 1;
  if (atCount !== 1) return true;
  // Emails with spaces, angle brackets, or null bytes are almost certainly
  // scraped form data that happens to include header junk.
  if (/[<>\s\0]/.test(email)) return true;
  return false;
}

export async function POST(req: NextRequest) {
  // Risk-12 — 5 submissions per 60s per IP-hash. Blocks obvious scripted
  // signups; legitimate users never hit this. In-process bucket resets on
  // deploy, which is fine for v1.
  const ipHash = ipHashFromRequest(req);
  const gate = checkRateLimit(`subscribe:${ipHash}`, 5, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests — try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) },
      },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    // Silent success — don't tell bots whether the payload was valid.
    return NextResponse.json({ ok: true, silent: true });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const source = parsed.data.source?.trim().toLowerCase() || "footer";

  if (looksLikeGarbage(email)) {
    return NextResponse.json({ ok: true, silent: true });
  }

  // Attach the authenticated user id so admin can see which subscribers have
  // an account tied to them. Not a hard requirement — anonymous subscribes
  // still succeed.
  const sessionUser = await getSessionUser().catch(() => null);

  const existing = await db
    .select()
    .from(emailSubscribers)
    .where(eq(emailSubscribers.email, email))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    if (row.status === "active") {
      return NextResponse.json({ ok: true, already: true });
    }
    // Reactivate a previously unsubscribed/bounced entry.
    await db
      .update(emailSubscribers)
      .set({
        status: "active",
        unsubscribedAt: null,
        source,
        userId: sessionUser?.id ?? row.userId,
      })
      .where(eq(emailSubscribers.id, row.id));

    // Send welcome email on reactivation (fire-and-forget).
    void sendNewsletterWelcomeEmail(email, row.unsubscribeToken || crypto.randomBytes(16).toString("hex")).catch((err) =>
      console.error("[subscribe] reactivation email failed:", err)
    );

    return NextResponse.json({ ok: true, reactivated: true });
  }

  const unsubscribeToken = crypto.randomBytes(16).toString("hex");
  await db.insert(emailSubscribers).values({
    id: crypto.randomUUID(),
    email,
    source,
    userId: sessionUser?.id ?? null,
    unsubscribeToken,
  });

  // Send welcome email on new subscription (fire-and-forget).
  void sendNewsletterWelcomeEmail(email, unsubscribeToken).catch((err) =>
    console.error("[subscribe] welcome email failed:", err)
  );

  return NextResponse.json({ ok: true });
}
