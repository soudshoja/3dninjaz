/**
 * Dispatcher safety tests with fakes only. Nothing here touches a database or
 * the gateway; sendText/sendMedia are vi.fn stubs, so no message can ever be
 * sent to a real number.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { execute: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) } }));
vi.mock("@/lib/whatsapp/settings", () => ({ getWhatsappStateFresh: vi.fn() }));
vi.mock("@/lib/whatsapp/client", () => ({ sendText: vi.fn(), sendMedia: vi.fn() }));
vi.mock("@/lib/pdf/render-invoice", () => ({ renderInvoicePdfBase64: vi.fn() }));
vi.mock("@/lib/orders", () => ({ formatOrderNumber: (id: string) => `ORD-${id}` }));
vi.mock("@/lib/whatsapp/reconciler", () => ({ runOutboxReconcile: vi.fn() }));

import { MySqlDialect } from "drizzle-orm/mysql-core";
import { db } from "@/lib/db";
import {
  defaultDeps,
  REAP_STUCK_MINUTES,
  runOutboxTick,
  type DispatcherDeps,
  type OutboxCandidate,
} from "@/lib/whatsapp/dispatcher";

function cand(over: Partial<OutboxCandidate> = {}): OutboxCandidate {
  return {
    id: "r1",
    eventKey: "order_delivered",
    orderId: "o1",
    recipient: "60123450550",
    payloadKind: "text",
    payloadText: "hi",
    payloadRef: null,
    attempts: 0,
    ageSeconds: 10,
    ...over,
  };
}

function makeDeps(candidates: OutboxCandidate[], enabled = true) {
  const sendText = vi.fn().mockResolvedValue({
    ok: true,
    httpStatus: 201,
    keyId: "K1",
    providerStatus: "PENDING",
    error: null,
  });
  const sendMedia = vi.fn();
  const deps = {
    config: { renderTimeoutMs: 20, maxPerTick: 10, sendGapMs: 0, maxAgeMin: 30 },
    reapStuck: vi.fn().mockResolvedValue(0),
    selectCandidates: vi.fn().mockResolvedValue(candidates),
    claim: vi.fn().mockResolvedValue(true),
    markStale: vi.fn().mockResolvedValue(undefined),
    releaseForToggle: vi.fn().mockResolvedValue(undefined),
    markAccepted: vi.fn().mockResolvedValue(undefined),
    markFailure: vi.fn().mockResolvedValue(undefined),
    notificationsEnabled: vi.fn().mockResolvedValue(enabled),
    orderStatus: vi.fn().mockResolvedValue("pending"),
    markCancelled: vi.fn().mockResolvedValue(undefined),
    sendText,
    sendMedia,
    renderPdf: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
  } as unknown as DispatcherDeps & {
    markStale: ReturnType<typeof vi.fn>;
    markAccepted: ReturnType<typeof vi.fn>;
    markFailure: ReturnType<typeof vi.fn>;
  };
  return { deps, sendText, sendMedia };
}

beforeEach(() => {
  (globalThis as { __waOutboxTickRunning?: boolean }).__waOutboxTickRunning = false;
});

describe("cold-start age guard", () => {
  it("never sends never-attempted rows older than 30 minutes (80 delivered orders scenario)", async () => {
    const stale = Array.from({ length: 80 }, (_, i) =>
      cand({ id: `old${i}`, ageSeconds: 31 * 60 }),
    );
    const { deps, sendText, sendMedia } = makeDeps(stale);
    const r = await runOutboxTick(deps);
    expect(sendText).not.toHaveBeenCalled();
    expect(sendMedia).not.toHaveBeenCalled();
    expect(deps.markStale).toHaveBeenCalledTimes(80);
    expect(r.skipped).toBe(80);
    expect(r.sent).toBe(0);
  });

  it("sends a fresh row", async () => {
    const { deps, sendText } = makeDeps([cand({ ageSeconds: 60 })]);
    const r = await runOutboxTick(deps);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(r.sent).toBe(1);
    expect(deps.markStale).not.toHaveBeenCalled();
  });

  it("exempts rows already attempted (legitimate backoff retries)", async () => {
    const { deps, sendText } = makeDeps([cand({ attempts: 3, ageSeconds: 5 * 3600 })]);
    await runOutboxTick(deps);
    expect(sendText).toHaveBeenCalledTimes(1);
  });
});

describe("order-state re-check before send (M2)", () => {
  async function run(eventKey: string, status: string | null, orderId: string | null = "o1") {
    const { deps, sendText } = makeDeps([cand({ eventKey, orderId })]);
    (deps.orderStatus as ReturnType<typeof vi.fn>).mockResolvedValue(status);
    await runOutboxTick(deps);
    return { deps, sendText };
  }

  it("cancels a payment reminder when the order has since been paid", async () => {
    const { deps, sendText } = await run("order_pending", "paid");
    expect(sendText).not.toHaveBeenCalled();
    expect((deps.markCancelled as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("order-state-changed");
  });

  it("cancels bank-transfer instructions once payment proof is under review", async () => {
    const { sendText } = await run("order_bank_transfer_instructions", "awaiting_payment_review");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("cancels payment reminders for a deleted order", async () => {
    const { sendText } = await run("order_pending", null);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("still sends a payment reminder while the order is pending", async () => {
    const { sendText } = await run("order_pending", "pending");
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("blocks shipped/confirmation messages for a cancelled order", async () => {
    for (const ev of ["order_shipped", "order_confirmation", "order_delivered"]) {
      const { sendText } = await run(ev, "cancelled");
      expect(sendText).not.toHaveBeenCalled();
    }
  });

  it("never blocks the cancellation notice, refunds, returns or unknown events", async () => {
    for (const ev of ["order_cancelled", "order_refunded", "return_requested", "some_future_event"]) {
      const { sendText } = await run(ev, "cancelled");
      expect(sendText).toHaveBeenCalledTimes(1);
    }
  });

  it("does not look up an order for rows without an order_id", async () => {
    const { deps, sendText } = await run("draft_abandoned_reminder", "cancelled", null);
    expect(deps.orderStatus).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
  });
});

describe("48h age horizon (M1)", () => {
  it("a 429 at 33h old is still retried (survives the 32.6h outage)", async () => {
    const { deps, sendText } = makeDeps([cand({ attempts: 9, ageSeconds: 33 * 3600 })]);
    sendText.mockResolvedValue({ ok: false, httpStatus: 429, keyId: null, providerStatus: null, error: "slow" });
    await runOutboxTick(deps);
    expect(deps.markFailure.mock.calls[0][1].status).toBe("failed_retryable");
  });

  it("a failure whose next retry would pass 48h goes final with max-age", async () => {
    const { deps, sendText } = makeDeps([cand({ attempts: 9, ageSeconds: 47.9 * 3600 })]);
    sendText.mockResolvedValue({ ok: false, httpStatus: 503, keyId: null, providerStatus: null, error: "down" });
    await runOutboxTick(deps);
    const f = deps.markFailure.mock.calls[0][1];
    expect(f.status).toBe("failed_final");
    expect(f.error).toMatch(/^max-age/);
  });

  it("never sends a retry row older than 48h", async () => {
    const { deps, sendText } = makeDeps([cand({ attempts: 4, ageSeconds: 49 * 3600 })]);
    await runOutboxTick(deps);
    expect(sendText).not.toHaveBeenCalled();
    expect(deps.markFailure.mock.calls[0][1].error).toMatch(/^max-age/);
  });
});

describe("stuck-row reaper (H2)", () => {
  it("parks stuck 'sending' rows as failed_final/unconfirmed and never re-queues them", async () => {
    await defaultDeps().reapStuck();
    const q = (db.execute as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    const { sql: text, params } = new MySqlDialect().sqlToQuery(q);
    expect(text).toMatch(/status = 'failed_final'/);
    expect(text).toMatch(/attempts = attempts \+ 1/);
    expect(text).toMatch(/stuck-sending-unknown/);
    expect(text).not.toMatch(/failed_retryable/);
    expect(text).not.toMatch(/queued/);
    expect(params).toContain(REAP_STUCK_MINUTES);
    expect(REAP_STUCK_MINUTES).toBe(10);
  });

  it("a hung PDF render fails retryably instead of holding the row", async () => {
    const { deps, sendMedia } = makeDeps([cand({ payloadKind: "invoice_pdf", payloadRef: "o1" })]);
    (deps.renderPdf as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    await runOutboxTick(deps);
    expect(sendMedia).not.toHaveBeenCalled();
    const f = deps.markFailure.mock.calls[0][1];
    expect(f.status).toBe("failed_retryable");
    expect(f.error).toBe("pdf-render-failed");
  });
});

describe("other safety behaviour", () => {
  it("does not send when the master toggle is off", async () => {
    const { deps, sendText } = makeDeps([cand()], false);
    await runOutboxTick(deps);
    expect(sendText).not.toHaveBeenCalled();
    expect(deps.releaseForToggle).toHaveBeenCalled();
  });

  it("skips rows it fails to claim", async () => {
    const { deps, sendText } = makeDeps([cand()]);
    (deps.claim as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await runOutboxTick(deps);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("marks a 429 retryable and a 404 final", async () => {
    const { deps, sendText } = makeDeps([cand({ id: "a" }), cand({ id: "b" })]);
    sendText
      .mockResolvedValueOnce({ ok: false, httpStatus: 429, keyId: null, providerStatus: null, error: "slow" })
      .mockResolvedValueOnce({ ok: false, httpStatus: 404, keyId: null, providerStatus: null, error: "gone" });
    await runOutboxTick(deps);
    const calls = deps.markFailure.mock.calls;
    expect(calls[0][1].status).toBe("failed_retryable");
    expect(calls[1][1].status).toBe("failed_final");
  });

  it("a timeout is NOT auto-retried: failed_final / timeout-unknown", async () => {
    const { deps, sendText } = makeDeps([cand()]);
    sendText.mockResolvedValue({ ok: false, httpStatus: null, keyId: null, providerStatus: null, error: "timeout" });
    await runOutboxTick(deps);
    expect(sendText).toHaveBeenCalledTimes(1);
    const f = deps.markFailure.mock.calls[0][1];
    expect(f.status).toBe("failed_final");
    expect(f.error).toBe("timeout-unknown");
  });

  it("a 428 and a refused connection still retry", async () => {
    const { deps, sendText } = makeDeps([cand({ id: "a" }), cand({ id: "b" })]);
    sendText
      .mockResolvedValueOnce({ ok: false, httpStatus: 428, keyId: null, providerStatus: null, error: "precondition" })
      .mockResolvedValueOnce({ ok: false, httpStatus: null, keyId: null, providerStatus: null, error: "connect ECONNREFUSED" });
    await runOutboxTick(deps);
    expect(deps.markFailure.mock.calls[0][1].status).toBe("failed_retryable");
    expect(deps.markFailure.mock.calls[1][1].status).toBe("failed_retryable");
  });

  it("is single-flight", async () => {
    (globalThis as { __waOutboxTickRunning?: boolean }).__waOutboxTickRunning = true;
    const { deps } = makeDeps([cand()]);
    const r = await runOutboxTick(deps);
    expect(r.claimed).toBe(0);
    expect(deps.selectCandidates).not.toHaveBeenCalled();
  });
});
