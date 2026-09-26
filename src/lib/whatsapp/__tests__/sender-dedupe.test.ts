/**
 * H3: a manual "shipped, tracking pending" message and the later booked
 * shipment message (real tracking number) are two different notifications and
 * must be two outbox rows; a genuine duplicate of the same event must dedupe.
 * The outbox is faked with an in-memory unique-key set (same semantics as the
 * DB unique index).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/whatsapp/settings", () => ({
  getWhatsappStateFresh: vi.fn().mockResolvedValue({ notificationsEnabled: true }),
  getWhatsappNotification: vi.fn().mockResolvedValue({ enabled: true, template: "Shipped {{orderNumber}} {{trackingNo}}" }),
}));

const rows = new Map<string, unknown>();
vi.mock("@/lib/whatsapp/outbox", async () => {
  const { buildIdempotencyKey } = await import("@/lib/whatsapp/outbox-types");
  return {
    enqueueOutbox: vi.fn(async (i: {
      eventKey: string;
      orderId?: string | null;
      recipient: string;
      dedupeSuffix?: string | null;
    }) => {
      const key = buildIdempotencyKey({
        eventKey: i.eventKey,
        orderId: i.orderId,
        recipient: i.recipient,
        suffix: i.dedupeSuffix,
      });
      if (rows.has(key)) return { enqueued: false, id: null };
      rows.set(key, i);
      return { enqueued: true, id: key };
    }),
  };
});

import { sendWhatsAppNotification } from "@/lib/whatsapp/sender";

const vars = (trackingNo: string) => ({
  orderId: "o1",
  orderNumber: "ORD-1",
  trackingNo,
});

beforeEach(() => rows.clear());

describe("order_shipped dedupe", () => {
  it("manual (pending) then booked (real tracking) are two rows", async () => {
    await sendWhatsAppNotification("order_shipped", "0123450550", vars("pending"), {
      dedupeSuffix: "manual",
    });
    await sendWhatsAppNotification("order_shipped", "0123450550", vars("JT123"), {
      dedupeSuffix: "trk:JT123",
    });
    expect(rows.size).toBe(2);
  });

  it("the same event with the same suffix still dedupes", async () => {
    for (let i = 0; i < 3; i++) {
      await sendWhatsAppNotification("order_shipped", "0123450550", vars("JT123"), {
        dedupeSuffix: "trk:JT123",
      });
    }
    expect(rows.size).toBe(1);
  });

  it("without a suffix, a repeat for the same order dedupes (the pre-fix behaviour)", async () => {
    await sendWhatsAppNotification("order_shipped", "0123450550", vars("pending"));
    await sendWhatsAppNotification("order_shipped", "0123450550", vars("JT123"));
    expect(rows.size).toBe(1);
  });
});
