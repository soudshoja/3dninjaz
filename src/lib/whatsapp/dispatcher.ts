/**
 * WhatsApp outbox dispatcher (server-only).
 *
 * Plain server module - NOT "use server". Registered from instrumentation.ts.
 *
 * runOutboxTick() takes injectable deps so the safety logic (cold-start age
 * guard, toggle re-check, failure classification) is unit-tested with fakes
 * and never touches a database or the gateway.
 *
 * All time math runs in SQL on the DB clock (NOW()) - the same clock that
 * stamps column defaults - so app/DB timezone skew cannot matter. (The plan
 * text says UTC_TIMESTAMP(); NOW() is used consistently instead because the
 * column defaults are CURRENT_TIMESTAMP.)
 *
 * Cold-start age guard: a row that has NEVER been attempted (attempts = 0)
 * and is older than WHATSAPP_OUTBOX_MAX_AGE_MIN (default 30) is never sent;
 * it goes to failed_final with last_error='stale-age-guard' and is visible
 * in the admin view. Rows already attempted (attempts > 0) are legitimate
 * retries of a message that was fresh when first tried, so they are exempt -
 * otherwise no retry beyond 30 minutes could ever happen and the backoff
 * schedule would be meaningless.
 */
import "server-only";
import { sql } from "drizzle-orm";
import os from "node:os";
import { db } from "@/lib/db";
import { getWhatsappStateFresh } from "@/lib/whatsapp/settings";
import { sendText, sendMedia, type EvoSendResult } from "@/lib/whatsapp/client";
import { renderInvoicePdfBase64 } from "@/lib/pdf/render-invoice";
import { formatOrderNumber } from "@/lib/orders";
import { runOutboxReconcile } from "@/lib/whatsapp/reconciler";
import {
  MAX_AGE_SECONDS,
  shouldGiveUp,
  orderStateBlocksSend,
  ackRank,
  classifyFailure,
  nextBackoffMs,
  type FailureClass,
} from "@/lib/whatsapp/outbox-types";

export type OutboxCandidate = {
  id: string;
  eventKey: string;
  orderId: string | null;
  recipient: string;
  payloadKind: "text" | "invoice_pdf";
  payloadText: string | null;
  payloadRef: string | null;
  attempts: number;
  ageSeconds: number;
};

/** How long a row may sit in 'sending' before being parked as unconfirmed. */
export const REAP_STUCK_MINUTES = 10;

export type DispatcherConfig = {
  renderTimeoutMs: number;
  maxPerTick: number;
  sendGapMs: number;
  maxAgeMin: number;
};

export type DispatcherDeps = {
  config: DispatcherConfig;
  reapStuck(): Promise<number>;
  selectCandidates(limit: number): Promise<OutboxCandidate[]>;
  claim(id: string): Promise<boolean>;
  markStale(id: string): Promise<void>;
  releaseForToggle(id: string): Promise<void>;
  markAccepted(id: string, r: EvoSendResult, attempts: number): Promise<void>;
  markFailure(
    id: string,
    f: {
      status: "failed_retryable" | "failed_final";
      attempts: number;
      error: string;
      httpStatus: number | null;
      delayMs: number;
    },
  ): Promise<void>;
  notificationsEnabled(): Promise<boolean>;
  orderStatus(orderId: string): Promise<string | null>;
  markCancelled(id: string, reason: string): Promise<void>;
  sendText: typeof sendText;
  sendMedia: typeof sendMedia;
  renderPdf(orderId: string): Promise<string | null>;
  sleep(ms: number): Promise<void>;
};

export type TickResult = {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
};

function envInt(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

const WORKER_ID = `${os.hostname()}:${process.pid}`;

function affected(result: unknown): number {
  if (Array.isArray(result)) {
    return (result[0] as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
  }
  return (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Record<string, unknown>[];
  }
  return [];
}

export function defaultDeps(): DispatcherDeps {
  return {
    config: {
      renderTimeoutMs: 60_000,
      maxPerTick: envInt("WHATSAPP_OUTBOX_MAX_PER_TICK", 10),
      sendGapMs: envInt("WHATSAPP_OUTBOX_SEND_GAP_MS", 3000),
      maxAgeMin: envInt("WHATSAPP_OUTBOX_MAX_AGE_MIN", 30),
    },
    async reapStuck() {
      // A row stuck in 'sending' means the process died somewhere between
      // claim and markAccepted - possibly AFTER the gateway returned 201. It
      // must NEVER be auto-resent (duplicate customer message): park it as
      // failed_final so an admin can decide. The 10 minute window comfortably
      // exceeds PDF render (60s cap) + the 30s media timeout.
      const r = await db.execute(sql`
        UPDATE whatsapp_outbox
        SET status = 'failed_final', attempts = attempts + 1,
            last_error = 'stuck-sending-unknown'
        WHERE status = 'sending'
          AND claimed_at < NOW() - INTERVAL ${REAP_STUCK_MINUTES} MINUTE`);
      return affected(r);
    },
    async selectCandidates(limit) {
      const r = await db.execute(sql`
        SELECT id, event_key, order_id, recipient, payload_kind, payload_text,
               payload_ref, attempts,
               TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_seconds
        FROM whatsapp_outbox
        WHERE status IN ('queued','failed_retryable') AND next_attempt_at <= NOW()
        ORDER BY created_at ASC
        LIMIT ${limit}`);
      return rowsOf(r).map((x) => ({
        id: String(x.id),
        eventKey: String(x.event_key),
        orderId: (x.order_id as string | null) ?? null,
        recipient: String(x.recipient),
        payloadKind: x.payload_kind === "invoice_pdf" ? "invoice_pdf" : "text",
        payloadText: (x.payload_text as string | null) ?? null,
        payloadRef: (x.payload_ref as string | null) ?? null,
        attempts: Number(x.attempts),
        ageSeconds: Number(x.age_seconds),
      }));
    },
    async claim(id) {
      // Atomic conditional claim (D-2): affectedRows === 1 => we own the row.
      const r = await db.execute(sql`
        UPDATE whatsapp_outbox
        SET status = 'sending', claimed_at = NOW(), claimed_by = ${WORKER_ID}
        WHERE id = ${id} AND status IN ('queued','failed_retryable')`);
      return affected(r) === 1;
    },
    async markStale(id) {
      await db.execute(sql`
        UPDATE whatsapp_outbox
        SET status = 'failed_final', last_error = 'stale-age-guard'
        WHERE id = ${id}`);
    },
    async releaseForToggle(id) {
      await db.execute(sql`
        UPDATE whatsapp_outbox
        SET status = 'queued', next_attempt_at = NOW() + INTERVAL 5 MINUTE
        WHERE id = ${id}`);
    },
    async markAccepted(id, r, attempts) {
      const rank = ackRank(r.providerStatus);
      try {
        await db.execute(sql`
          UPDATE whatsapp_outbox
          SET status = 'accepted', provider_key_id = ${r.keyId},
              ack_status = ${r.providerStatus}, ack_rank = ${rank},
              sent_at = NOW(), attempts = ${attempts}, last_error = NULL,
              last_http_status = ${r.httpStatus}
          WHERE id = ${id}`);
      } catch (err) {
        // e.g. duplicate provider_key_id. The message WAS sent, so never
        // leave the row 'sending' (the reaper would re-send it).
        console.error("[whatsapp-outbox] markAccepted retrying w/o key", id, err);
        await db.execute(sql`
          UPDATE whatsapp_outbox
          SET status = 'accepted', sent_at = NOW(), attempts = ${attempts},
              last_error = 'provider-key-collision'
          WHERE id = ${id}`);
      }
    },
    async markFailure(id, f) {
      const err = f.error.slice(0, 500);
      const secs = Math.ceil(f.delayMs / 1000);
      await db.execute(sql`
        UPDATE whatsapp_outbox
        SET status = ${f.status}, attempts = ${f.attempts}, last_error = ${err},
            last_http_status = ${f.httpStatus},
            next_attempt_at = NOW() + INTERVAL ${secs} SECOND
        WHERE id = ${id}`);
    },
    async orderStatus(orderId) {
      const r = await db.execute(
        sql`SELECT status FROM orders WHERE id = ${orderId} LIMIT 1`,
      );
      const row = rowsOf(r)[0];
      return row ? String(row.status) : null;
    },
    async markCancelled(id, reason) {
      await db.execute(sql`
        UPDATE whatsapp_outbox SET status = 'cancelled', last_error = ${reason}
        WHERE id = ${id}`);
    },
    async notificationsEnabled() {
      return (await getWhatsappStateFresh()).notificationsEnabled;
    },
    sendText,
    sendMedia,
    renderPdf: (orderId) => renderInvoicePdfBase64(orderId),
    sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
  };
}

type G = typeof globalThis & {
  __waOutboxTickRunning?: boolean;
  __waOutboxDispatcherStarted?: boolean;
  __waOutboxTickCount?: number;
};

export async function runOutboxTick(
  deps: DispatcherDeps = defaultDeps(),
): Promise<TickResult> {
  const g = globalThis as G;
  const result: TickResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  if (g.__waOutboxTickRunning) return result;
  g.__waOutboxTickRunning = true;
  try {
    await deps.reapStuck();
    const candidates = await deps.selectCandidates(deps.config.maxPerTick);
    const maxAgeSec = deps.config.maxAgeMin * 60;

    for (const c of candidates) {
      if (!(await deps.claim(c.id))) continue;
      result.claimed++;

      // Cold-start age guard - never send a never-attempted stale row.
      if (c.attempts === 0 && c.ageSeconds > maxAgeSec) {
        await deps.markStale(c.id);
        result.skipped++;
        continue;
      }

      // Age horizon: never send anything older than 48h, even if the
      // dispatcher was down when its retry came due.
      if (c.ageSeconds > MAX_AGE_SECONDS) {
        await deps.markFailure(c.id, {
          status: "failed_final",
          attempts: c.attempts,
          error: "max-age: expired before send",
          httpStatus: null,
          delayMs: 0,
        });
        result.skipped++;
        continue;
      }

      // Master toggle re-check (NOT connection_state - untrusted signal).
      if (!(await deps.notificationsEnabled())) {
        await deps.releaseForToggle(c.id);
        result.skipped++;
        continue;
      }

      // Order-state re-check: the text was frozen at enqueue time.
      if (c.orderId) {
        const st = await deps.orderStatus(c.orderId);
        if (orderStateBlocksSend(c.eventKey, st)) {
          await deps.markCancelled(c.id, "order-state-changed");
          result.skipped++;
          continue;
        }
      }

      let send: EvoSendResult;
      const attempts = c.attempts + 1;
      if (c.payloadKind === "invoice_pdf") {
        const ref = c.payloadRef;
        // A hung PDF render must not eat the reaper window while the row sits
        // in 'sending'. Nothing has been sent yet, so timing out is a safe,
        // retryable failure.
        const base64 = ref
          ? await withTimeout(deps.renderPdf(ref), deps.config.renderTimeoutMs)
          : null;
        if (!ref || !base64) {
          await failRow(deps, c.id, attempts, c.ageSeconds, "pdf-render-failed", null, "retryable");
          result.failed++;
          continue;
        }
        send = await deps.sendMedia({
          number: c.recipient,
          base64,
          fileName: `invoice-${formatOrderNumber(ref)}.pdf`,
        });
      } else {
        send = await deps.sendText({
          number: c.recipient,
          text: c.payloadText ?? "",
        });
      }

      if (send.ok) {
        if (!send.keyId) {
          console.warn("[whatsapp-outbox] accepted without key.id", c.id);
        }
        await deps.markAccepted(c.id, send, attempts);
        result.sent++;
      } else {
        await failRow(
          deps,
          c.id,
          attempts,
          c.ageSeconds,
          send.error ?? "send-failed",
          send.httpStatus,
          classifyFailure(send.httpStatus, send.error),
        );
        result.failed++;
      }
      await deps.sleep(deps.config.sendGapMs);
    }
  } catch (err) {
    console.error("[whatsapp-outbox] tick failed", err);
  } finally {
    g.__waOutboxTickRunning = false;
  }
  return result;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

async function failRow(
  deps: DispatcherDeps,
  id: string,
  attempts: number,
  ageSeconds: number,
  error: string,
  httpStatus: number | null,
  klass: FailureClass,
): Promise<void> {
  if (klass === "unconfirmed") {
    // Timed out: the gateway may have delivered it. Never auto-resend.
    await deps.markFailure(id, {
      status: "failed_final",
      attempts,
      error: "timeout-unknown",
      httpStatus,
      delayMs: 0,
    });
    return;
  }
  const retryable = klass === "retryable";
  const delayMs = nextBackoffMs(attempts);
  const giveUp = retryable ? shouldGiveUp({ attempts, ageSeconds, delayMs }) : null;
  if (retryable && !giveUp) {
    await deps.markFailure(id, {
      status: "failed_retryable",
      attempts,
      error,
      httpStatus,
      delayMs,
    });
  } else {
    await deps.markFailure(id, {
      status: "failed_final",
      attempts,
      error: retryable ? `${giveUp}: ${error}` : error,
      httpStatus,
      delayMs: 0,
    });
  }
}

export function startOutboxDispatcher(): void {
  const g = globalThis as G;
  if (g.__waOutboxDispatcherStarted) return;
  g.__waOutboxDispatcherStarted = true;
  const every = envInt("WHATSAPP_OUTBOX_TICK_MS", 15_000);
  const timer = setInterval(() => {
    void (async () => {
      await runOutboxTick();
      g.__waOutboxTickCount = (g.__waOutboxTickCount ?? 0) + 1;
      // Reconcile roughly once a minute (inert unless ack flag is live).
      if (g.__waOutboxTickCount % Math.max(1, Math.round(60_000 / every)) === 0) {
        await runOutboxReconcile();
      }
    })().catch((e) => console.error("[whatsapp-outbox] interval error", e));
  }, every);
  timer.unref();
  console.log(`[whatsapp-outbox] dispatcher started (every ${every}ms)`);
}
