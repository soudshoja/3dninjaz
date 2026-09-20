/**
 * Dispatcher safety tests with fakes only. Nothing here touches a database or
 * the gateway; sendText/sendMedia are vi.fn stubs, so no message can ever be
 * sent to a real number.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/whatsapp/settings", () => ({ getWhatsappStateFresh: vi.fn() }));
vi.mock("@/lib/whatsapp/client", () => ({ sendText: vi.fn(), sendMedia: vi.fn() }));
vi.mock("@/lib/pdf/render-invoice", () => ({ renderInvoicePdfBase64: vi.fn() }));
vi.mock("@/lib/orders", () => ({ formatOrderNumber: (id: string) => `ORD-${id}` }));
vi.mock("@/lib/whatsapp/reconciler", () => ({ runOutboxReconcile: vi.fn() }));

import {
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
    config: { maxPerTick: 10, sendGapMs: 0, maxAgeMin: 30 },
    reapStuck: vi.fn().mockResolvedValue(0),
    selectCandidates: vi.fn().mockResolvedValue(candidates),
    claim: vi.fn().mockResolvedValue(true),
    markStale: vi.fn().mockResolvedValue(undefined),
    releaseForToggle: vi.fn().mockResolvedValue(undefined),
    markAccepted: vi.fn().mockResolvedValue(undefined),
    markFailure: vi.fn().mockResolvedValue(undefined),
    notificationsEnabled: vi.fn().mockResolvedValue(enabled),
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

  it("is single-flight", async () => {
    (globalThis as { __waOutboxTickRunning?: boolean }).__waOutboxTickRunning = true;
    const { deps } = makeDeps([cand()]);
    const r = await runOutboxTick(deps);
    expect(r.claimed).toBe(0);
    expect(deps.selectCandidates).not.toHaveBeenCalled();
  });
});
