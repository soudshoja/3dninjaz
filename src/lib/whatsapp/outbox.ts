/**
 * WhatsApp outbox — enqueue + ack-apply (server-only, DB access).
 *
 * Plain server module — NOT "use server". Imported by src/lib/whatsapp/
 * sender.ts (enqueue) and the dispatcher / webhook route (drain + ack).
 *
 * NEVER throws — every exported function catches internally and returns a
 * result object, matching the "best-effort, fire-and-forget-safe" contract
 * the call sites already rely on.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappOutbox } from "@/lib/db/schema";
import { buildIdempotencyKey, ackRank, ackToStatus } from "@/lib/whatsapp/outbox-types";

function unwrapAffectedRows(result: unknown): number {
  // Drizzle's mysql2 driver sometimes returns the raw [ResultSetHeader,
  // FieldPacket[]] tuple and sometimes the already-unwrapped ResultSetHeader
  // depending on call path — tolerate both (see admin-quotations.ts /
  // coupons.ts precedent in this repo).
  if (Array.isArray(result)) {
    return (result[0] as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
  }
  return (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

export type EnqueueOutboxInput = {
  eventKey: string;
  orderId?: string | null;
  recipient: string;
  payloadKind: "text" | "invoice_pdf";
  payloadText?: string | null;
  payloadRef?: string | null;
  dedupeSuffix?: string | null;
};

export type EnqueueOutboxResult = {
  enqueued: boolean;
  id: string | null;
  /** True only when the failure was "table does not exist" (code before migration). */
  tableMissing?: boolean;
};

/**
 * Enqueue a row into whatsapp_outbox. Idempotent via the DB-enforced unique
 * index on idempotency_key (D-4) — a repeated enqueue with identical inputs
 * (and no dedupeSuffix) is a no-op INSERT, not a second row.
 *
 * Never throws.
 */
export async function enqueueOutbox(
  input: EnqueueOutboxInput,
): Promise<EnqueueOutboxResult> {
  try {
    const idempotencyKey = buildIdempotencyKey({
      eventKey: input.eventKey,
      orderId: input.orderId ?? null,
      recipient: input.recipient,
      suffix: input.dedupeSuffix ?? null,
    });

    const id = randomUUID();

    const result = await db
      .insert(whatsappOutbox)
      .values({
        id,
        idempotencyKey,
        eventKey: input.eventKey,
        orderId: input.orderId ?? null,
        recipient: input.recipient,
        payloadKind: input.payloadKind,
        payloadText: input.payloadText ?? null,
        payloadRef: input.payloadRef ?? null,
        status: "queued",
      })
      .onDuplicateKeyUpdate({ set: { id: sql`id` } });

    const affectedRows = unwrapAffectedRows(result);
    // MySQL/MariaDB ON DUPLICATE KEY UPDATE semantics: a fresh INSERT reports
    // affectedRows === 1; a no-op UPDATE (value unchanged) reports 0. Either
    // way, an actual duplicate never creates a second row — enqueued is
    // purely informational for the caller/tests.
    const enqueued = affectedRows === 1;

    return { enqueued, id: enqueued ? id : null };
  } catch (err) {
    const tableMissing = isMissingTableError(err);
    alertEnqueueFailure(input.eventKey, tableMissing, err);
    return { enqueued: false, id: null, tableMissing };
  }
}

// ---------------------------------------------------------------------------
// Loud failure reporting. Every enqueue error used to be a quiet console.error,
// so shipping the code before the migration would silently drop ALL
// notifications. The first failure, and at most one per 10 minutes after,
// emits a line beginning exactly "Error:" - the pattern scripts/log-alert.cjs
// matches - so it pages a human.
// ---------------------------------------------------------------------------

const ALERT_INTERVAL_MS = 10 * 60 * 1000;
let lastEnqueueAlertAt = 0;

export function isMissingTableError(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    const o = e as { code?: string; errno?: number; message?: string; cause?: unknown };
    if (o.code === "ER_NO_SUCH_TABLE" || o.errno === 1146) return true;
    if (typeof o.message === "string" && /table .*whatsapp_outbox.* doesn't exist/i.test(o.message)) {
      return true;
    }
    e = o.cause;
  }
  return false;
}

function alertEnqueueFailure(eventKey: string, tableMissing: boolean, err: unknown): void {
  const now = Date.now();
  if (lastEnqueueAlertAt !== 0 && now - lastEnqueueAlertAt < ALERT_INTERVAL_MS) return;
  lastEnqueueAlertAt = now;
  const reason = tableMissing
    ? "whatsapp_outbox table is MISSING (run scripts/whatsapp-outbox-migrate.cjs); falling back to direct send"
    : "database error while enqueueing";
  console.error(
    `Error: whatsapp-outbox enqueue failed (${eventKey}): ${reason} - notifications are being lost or bypassing the queue`,
    err instanceof Error ? err.message : err,
  );
}

export type ApplyAckInput = {
  keyId: string;
  fromMe: boolean;
  ackStatus: string;
};

/**
 * Apply a provider ack (from the messages.update webhook) to the matching
 * outbox row, looked up by provider_key_id. Monotonicity is enforced in SQL
 * via `ack_rank < ?`, never read-modify-write in JS — this makes an
 * out-of-order webhook delivery (e.g. READ arriving before DELIVERY_ACK) a
 * zero-row no-op atomically, with no race between concurrent deliveries.
 *
 * Never throws.
 */
export async function applyAck(input: ApplyAckInput): Promise<{ applied: boolean }> {
  try {
    if (!input.fromMe) return { applied: false };

    const rank = ackRank(input.ackStatus);

    if (input.ackStatus === "ERROR") {
      const result = await db
        .update(whatsappOutbox)
        .set({
          status: "failed_final",
          ackStatus: "ERROR",
          ackRank: -1,
          ackedAt: new Date(),
          lastError: "provider-ack-ERROR",
        })
        .where(
          and(
            eq(whatsappOutbox.providerKeyId, input.keyId),
            notInArray(whatsappOutbox.status, ["failed_final", "cancelled"]),
          ),
        );
      return { applied: unwrapAffectedRows(result) > 0 };
    }

    const nextStatus = ackToStatus(input.ackStatus);
    if (!nextStatus) return { applied: false };

    const result = await db
      .update(whatsappOutbox)
      .set({
        status: nextStatus,
        ackStatus: input.ackStatus,
        ackRank: rank,
        ackedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappOutbox.providerKeyId, input.keyId),
          // Monotonic guard, enforced in SQL (never read-modify-write in JS).
          lt(whatsappOutbox.ackRank, rank),
          // A provider-ERROR'd or admin-cancelled row must not be resurrected
          // by a late ack.
          notInArray(whatsappOutbox.status, ["failed_final", "cancelled"]),
        ),
      );

    return { applied: unwrapAffectedRows(result) > 0 };
  } catch (err) {
    console.error("[whatsapp-outbox] applyAck failed", input.keyId, err);
    return { applied: false };
  }
}

/**
 * Best-effort backfill of provider_key_id from a send.message webhook event
 * when the original 201 response body did not carry key.id. Matches on
 * recipient + status='accepted' + provider_key_id IS NULL, newest first.
 * Skips entirely if provider_key_id is already set (caller's responsibility
 * to check first is not required — this only ever targets NULL rows).
 *
 * Never throws.
 */
export async function backfillProviderKeyId(input: {
  recipient: string;
  keyId: string;
}): Promise<{ applied: boolean }> {
  try {
    const result = await db.execute(
      sql`UPDATE whatsapp_outbox
          SET provider_key_id = ${input.keyId}
          WHERE recipient = ${input.recipient}
            AND status = 'accepted'
            AND provider_key_id IS NULL
          ORDER BY created_at DESC
          LIMIT 1`,
    );
    return { applied: unwrapAffectedRows(result) > 0 };
  } catch (err) {
    console.error("[whatsapp-outbox] backfillProviderKeyId failed", input.recipient, err);
    return { applied: false };
  }
}
