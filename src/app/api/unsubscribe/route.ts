import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/unsubscribe?token=<unsubscribeToken>
 *
 * Public endpoint used by the one-click unsubscribe link in email footers
 * (CAN-SPAM / GDPR). Matches the token, flips status → 'unsubscribed', and
 * redirects to /unsubscribed (a branded confirmation page).
 *
 * Invalid / missing / already-unsubscribed tokens also redirect to
 * /unsubscribed with an `?invalid=1` hint so the page can show a soft
 * "we couldn't find that subscription" variant instead of crashing.
 *
 * NOTE: the token is not a secret beyond its opaqueness — it's embedded in
 * emails we send. It only grants the ability to unsubscribe, nothing more.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();

  const unsubscribedUrl = new URL("/unsubscribed", req.url);

  if (!token || token.length < 8 || token.length > 64) {
    unsubscribedUrl.searchParams.set("invalid", "1");
    return NextResponse.redirect(unsubscribedUrl, { status: 302 });
  }

  const rows = await db
    .select({
      id: emailSubscribers.id,
      status: emailSubscribers.status,
    })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.unsubscribeToken, token))
    .limit(1);

  if (rows.length === 0) {
    unsubscribedUrl.searchParams.set("invalid", "1");
    return NextResponse.redirect(unsubscribedUrl, { status: 302 });
  }

  const row = rows[0];
  if (row.status === "active") {
    await db
      .update(emailSubscribers)
      .set({ status: "unsubscribed", unsubscribedAt: new Date() })
      .where(eq(emailSubscribers.id, row.id));
  }

  return NextResponse.redirect(unsubscribedUrl, { status: 302 });
}
