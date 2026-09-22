/**
 * Watchdog poke for the WhatsApp outbox (Task 9).
 *
 * The in-process interval is the primary drain mechanism; this route exists so
 * a cron can prove the queue is moving and kick it if the interval died.
 * Guarded by the x-drain-secret header (see drain-auth.ts; never a query string).
 * Unauthenticated (or secret unset) => 200 with no effect, like the Evolution
 * webhook. Never sends anything itself beyond what runOutboxTick would.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { runOutboxTick } from "@/lib/whatsapp/dispatcher";
import { runOutboxReconcile } from "@/lib/whatsapp/reconciler";
import { isDrainAuthenticated } from "@/lib/whatsapp/drain-auth";

export async function POST(req: Request): Promise<NextResponse> {
  if (!isDrainAuthenticated(req)) return NextResponse.json({ ok: true });

  try {
    if (new URL(req.url).searchParams.get("wedged") === "1") {
      // Lands in app.log where scripts/log-alert.cjs pattern-matches "Error:".
      console.error(
        "Error: whatsapp-outbox wedged - queued rows but nothing sent for 3 consecutive watchdog runs",
      );
    }
    const tick = await runOutboxTick();
    const reconcile = await runOutboxReconcile();
    const r = await db.execute(
      sql`SELECT COUNT(*) AS n FROM whatsapp_outbox WHERE status IN ('queued','failed_retryable')`,
    );
    const first = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as { n?: unknown }) : undefined;
    return NextResponse.json({ ok: true, ...tick, queued: Number(first?.n ?? 0), reconcile });
  } catch (err) {
    console.error("[whatsapp-outbox] drain route failed", err);
    return NextResponse.json({ ok: false });
  }
}
