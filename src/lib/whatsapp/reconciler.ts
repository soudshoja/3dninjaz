/**
 * WhatsApp outbox — reconciler sweeps (server-only).
 *
 * Plain server module — NOT "use server".
 *
 * Written in Stage A but INERT until the gateway delivers real acks
 * (Stage B). Both sweeps sit behind WHATSAPP_ACK_WEBHOOKS_LIVE === "1".
 *
 * WHY THE GATE IS A LANDMINE GUARD, not a nicety: the "accepted with no
 * SERVER_ACK after 10 minutes -> requeue once" rule assumes acks arrive.
 * Today Evolution drops every messages.update for API-sent messages
 * (DATABASE_SAVE_DATA_HISTORIC=true on our gateway), so NO row would ever
 * reach SERVER_ACK — an ungated sweep would therefore send EVERY message
 * twice. While the flag is unset, `accepted` is a terminal success state and
 * this function returns before touching the database at all. The unit test
 * (__tests__/reconciler-gate.test.ts) asserts zero DB calls in that state.
 *
 * All time math is done in SQL against the DB clock (NOW()), the same clock
 * that stamps the column defaults, so app/DB timezone skew cannot matter.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type ReconcileResult = {
  requeued: number;
  undelivered: number;
  skipped?: "ack-webhooks-off";
};

function affected(result: unknown): number {
  if (Array.isArray(result)) {
    return (result[0] as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
  }
  return (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

export async function runOutboxReconcile(): Promise<ReconcileResult> {
  // MUST stay the first statement: no DB access of any kind before this.
  if (process.env.WHATSAPP_ACK_WEBHOOKS_LIVE !== "1") {
    console.log("[whatsapp-outbox] reconcile skipped: ack-webhooks-off");
    return { requeued: 0, undelivered: 0, skipped: "ack-webhooks-off" };
  }

  try {
    // Stuck-accepted: never got a SERVER_ACK within 10 minutes. `attempts < 2`
    // is what makes "requeue ONCE" structural rather than a comment — the
    // same idempotency key is reused so no new row is created.
    const requeue = await db.execute(sql`
      UPDATE whatsapp_outbox
      SET status = 'queued',
          next_attempt_at = NOW(),
          provider_key_id = NULL,
          ack_status = NULL,
          ack_rank = -1,
          last_error = 'requeued-no-server-ack'
      WHERE status = 'accepted'
        AND ack_rank < 1
        AND sent_at < NOW() - INTERVAL 10 MINUTE
        AND attempts < 2
    `);

    // Undelivered: server acked but never delivered within 24h. NO resend —
    // a recipient being offline is not our failure. Admin view only.
    const undelivered = await db.execute(sql`
      UPDATE whatsapp_outbox
      SET status = 'undelivered'
      WHERE status = 'server_ack'
        AND sent_at < NOW() - INTERVAL 24 HOUR
    `);

    return { requeued: affected(requeue), undelivered: affected(undelivered) };
  } catch (err) {
    console.error("[whatsapp-outbox] reconcile failed", err);
    return { requeued: 0, undelivered: 0 };
  }
}
