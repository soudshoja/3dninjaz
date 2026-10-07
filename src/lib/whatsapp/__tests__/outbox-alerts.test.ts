/**
 * M4: a failing outbox must be LOUD ("Error:" lines match scripts/log-alert.cjs),
 * throttled to one per 10 minutes, and a missing table (code shipped before the
 * migration) falls back to the pre-outbox direct send instead of dropping the
 * message. Fakes only: no DB, no gateway.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const insertError = { current: null as unknown };
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onDuplicateKeyUpdate: () => Promise.reject(insertError.current),
      }),
    }),
    execute: vi.fn(),
  },
}));
vi.mock("@/lib/whatsapp/settings", () => ({
  getWhatsappStateFresh: vi.fn().mockResolvedValue({ notificationsEnabled: true }),
  getWhatsappNotification: vi.fn().mockResolvedValue({ enabled: true, template: "Hi {{customerName}}" }),
}));
vi.mock("@/lib/whatsapp/client", () => ({
  sendText: vi.fn().mockResolvedValue({ ok: true }),
  sendMedia: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/pdf/render-invoice", () => ({ renderInvoicePdfBase64: vi.fn().mockResolvedValue("b64") }));
vi.mock("@/lib/orders", () => ({ formatOrderNumber: (id: string) => `ORD-${id}` }));

import { enqueueOutbox, isMissingTableError, maskPhone } from "@/lib/whatsapp/outbox";
import { sendWhatsAppNotification, sendWhatsAppInvoicePdf } from "@/lib/whatsapp/sender";
import { sendText, sendMedia } from "@/lib/whatsapp/client";
import { checkOutboxHealth } from "@/lib/whatsapp/dispatcher";

const missingTable = Object.assign(new Error("Table 'x.whatsapp_outbox' doesn't exist"), {
  code: "ER_NO_SUCH_TABLE",
  errno: 1146,
});
const input = { eventKey: "order_shipped", orderId: "o1", recipient: "60123450550", payloadKind: "text" as const };

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T00:00:00Z"));
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(sendText).mockClear();
  vi.mocked(sendMedia).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  errSpy.mockRestore();
});

const errorLines = () =>
  errSpy.mock.calls.filter((c) => typeof c[0] === "string" && (c[0] as string).startsWith("Error:"));

describe("enqueue failure alerting", () => {
  it("emits an Error: line on the first failure, then at most once per 10 minutes", async () => {
    insertError.current = new Error("connection lost");
    // Throttle state is module-level: run the sequence in one test.
    await enqueueOutbox(input);
    expect(errorLines()).toHaveLength(1);
    await enqueueOutbox(input);
    vi.advanceTimersByTime(9 * 60 * 1000);
    await enqueueOutbox(input);
    expect(errorLines()).toHaveLength(1);
    vi.advanceTimersByTime(2 * 60 * 1000);
    await enqueueOutbox(input);
    expect(errorLines()).toHaveLength(2);
  });

  it("never throws and reports tableMissing only for a missing table", async () => {
    insertError.current = missingTable;
    const r = await enqueueOutbox(input);
    expect(r).toMatchObject({ enqueued: false, id: null, tableMissing: true });
    insertError.current = new Error("deadlock");
    const r2 = await enqueueOutbox(input);
    expect(r2.tableMissing).toBe(false);
  });

  it("recognises a missing table wrapped in a cause chain", () => {
    expect(isMissingTableError({ message: "Failed query", cause: missingTable })).toBe(true);
    expect(isMissingTableError(new Error("nope"))).toBe(false);
  });
});

describe("phone masking (L1)", () => {
  it("keeps only the last 4 digits", () => {
    expect(maskPhone("60123450550")).toBe("*******0550");
    expect(maskPhone("123")).toBe("****");
  });
});

describe("direct-send fallback when the table is missing", () => {
  it("sends the text directly instead of dropping it", async () => {
    insertError.current = missingTable;
    await sendWhatsAppNotification("order_shipped", "0123450550", { customerName: "A", orderId: "o1" });
    expect(sendText).toHaveBeenCalledWith({ number: "60123450550", text: "Hi A" });
  });

  it("sends the invoice directly instead of dropping it", async () => {
    insertError.current = missingTable;
    await sendWhatsAppInvoicePdf("o1", "0123450550");
    expect(sendMedia).toHaveBeenCalledTimes(1);
  });

  it("does NOT bypass the queue for other database errors", async () => {
    insertError.current = new Error("deadlock");
    await sendWhatsAppNotification("order_shipped", "0123450550", { customerName: "A", orderId: "o1" });
    expect(sendText).not.toHaveBeenCalled();
  });
});

describe("checkOutboxHealth", () => {
  const saved = process.env.WHATSAPP_OUTBOX_DISPATCHER;
  afterEach(() => {
    if (saved === undefined) delete process.env.WHATSAPP_OUTBOX_DISPATCHER;
    else process.env.WHATSAPP_OUTBOX_DISPATCHER = saved;
  });

  it("logs Error: when the flag is unset", async () => {
    delete process.env.WHATSAPP_OUTBOX_DISPATCHER;
    const r = await checkOutboxHealth(async () => 1);
    expect(r).toEqual({ flagOn: false, tableOk: true });
    expect(errorLines().length).toBeGreaterThan(0);
  });

  it("logs Error: when the table probe fails", async () => {
    process.env.WHATSAPP_OUTBOX_DISPATCHER = "1";
    const r = await checkOutboxHealth(async () => {
      throw missingTable;
    });
    expect(r).toEqual({ flagOn: true, tableOk: false });
    expect(errorLines()).toHaveLength(1);
  });

  it("is silent when everything is healthy", async () => {
    process.env.WHATSAPP_OUTBOX_DISPATCHER = "1";
    await checkOutboxHealth(async () => 1);
    expect(errorLines()).toHaveLength(0);
  });
});
