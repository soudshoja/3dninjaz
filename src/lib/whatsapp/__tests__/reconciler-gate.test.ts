/**
 * Double-send guard: with WHATSAPP_ACK_WEBHOOKS_LIVE unset the reconciler
 * must return immediately and make ZERO database calls. With acks dead, an
 * ungated 10-minute requeue would send every message twice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const touched = vi.fn();
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get(_t, prop) {
        touched(String(prop));
        throw new Error(`db.${String(prop)} touched while ack webhooks are off`);
      },
    },
  ),
}));

import { runOutboxReconcile } from "@/lib/whatsapp/reconciler";

describe("runOutboxReconcile gate", () => {
  const saved = process.env.WHATSAPP_ACK_WEBHOOKS_LIVE;
  beforeEach(() => {
    touched.mockClear();
    delete process.env.WHATSAPP_ACK_WEBHOOKS_LIVE;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.WHATSAPP_ACK_WEBHOOKS_LIVE;
    else process.env.WHATSAPP_ACK_WEBHOOKS_LIVE = saved;
  });

  it("is inert and makes zero DB calls when the flag is unset", async () => {
    const r = await runOutboxReconcile();
    expect(r).toEqual({ requeued: 0, undelivered: 0, skipped: "ack-webhooks-off" });
    expect(touched).not.toHaveBeenCalled();
  });

  it("logs the skip only once per process", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runOutboxReconcile();
    await runOutboxReconcile();
    await runOutboxReconcile();
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("ack-webhooks-off")).length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });

  it("is inert for any value other than exactly '1'", async () => {
    for (const v of ["0", "true", "", "yes"]) {
      process.env.WHATSAPP_ACK_WEBHOOKS_LIVE = v;
      const r = await runOutboxReconcile();
      expect(r.skipped).toBe("ack-webhooks-off");
    }
    expect(touched).not.toHaveBeenCalled();
  });
});
