import { describe, it, expect, vi, beforeEach } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

// In-memory orders table. The fake db renders the REAL drizzle WHERE clause
// to SQL + params and evaluates it, so the atomic conditional UPDATE
// (status IN (...) AND id = ?) is what is actually under test.
const state = vi.hoisted(() => ({ orders: new Map<string, string>() }));

vi.mock("@/lib/order-delivery-notify", () => ({ notifyOrderDelivered: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { MySqlDialect: D } = await import("drizzle-orm/mysql-core");
  const dialect = new D();
  return {
    db: {
      update: () => ({
        set: (vals: { status: string }) => ({
          where: async (cond: unknown) => {
            const q = dialect.sqlToQuery(cond as never);
            // params order: id, then allowed statuses (see applyDeliveredTransition)
            expect(q.sql).toMatch(/`status` in \(\?, \?, \?\)/);
            const [id, ...allowed] = q.params as string[];
            const cur = state.orders.get(id);
            if (cur !== undefined && allowed.includes(cur)) {
              state.orders.set(id, vals.status);
              return [{ affectedRows: 1 }, undefined];
            }
            return [{ affectedRows: 0 }, undefined];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const [id] = [...state.orders.keys()];
              return id ? [{ status: state.orders.get(id) }] : [];
            },
          }),
        }),
      }),
    },
  };
});

import {
  applyDeliveredTransition,
  handleDeliveredSignal,
  isFreshDelivery,
  deliveredAtFromTracking,
  DELIVERED_NOTIFY_MAX_AGE_HOURS,
} from "./order-delivery";
import { notifyOrderDelivered } from "@/lib/order-delivery-notify";

void MySqlDialect;
const notify = vi.mocked(notifyOrderDelivered);
const H = 3_600_000;

beforeEach(() => {
  state.orders.clear();
  notify.mockReset();
});

describe("applyDeliveredTransition", () => {
  it("is atomic: true exactly once, false on repeat", async () => {
    state.orders.set("o1", "shipped");
    expect(await applyDeliveredTransition("o1")).toBe(true);
    expect(await applyDeliveredTransition("o1")).toBe(false);
    expect(state.orders.get("o1")).toBe("delivered");
  });

  it("flips shipped / processing / paid", async () => {
    for (const s of ["shipped", "processing", "paid"]) {
      state.orders.set("o", s);
      expect(await applyDeliveredTransition("o")).toBe(true);
    }
  });

  it("never flips cancelled / pending / unpaid orders", async () => {
    for (const s of ["cancelled", "pending", "awaiting_customer", "awaiting_payment_review"]) {
      state.orders.set("o", s);
      expect(await applyDeliveredTransition("o")).toBe(false);
      expect(state.orders.get("o")).toBe(s);
    }
  });

  it("unknown order id changes nothing", async () => {
    expect(await applyDeliveredTransition("nope")).toBe(false);
  });
});

describe("handleDeliveredSignal", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const fresh = new Date(now.getTime() - H);
  const stale = new Date(now.getTime() - (DELIVERED_NOTIFY_MAX_AGE_HOURS + 1) * H);
  const deps = (over = {}) => ({
    transition: applyDeliveredTransition,
    currentStatus: async (id: string) => state.orders.get(id) ?? null,
    notify: notifyOrderDelivered,
    now: () => now,
    ...over,
  });

  it("900 never flips or notifies", async () => {
    state.orders.set("o", "shipped");
    expect(await handleDeliveredSignal({ orderId: "o", statusCode: 900, deliveredAt: fresh }, deps())).toBe("not-delivered");
    expect(state.orders.get("o")).toBe("shipped");
    expect(notify).not.toHaveBeenCalled();
  });

  it("cancelled order: blocked, no notification", async () => {
    state.orders.set("o", "cancelled");
    expect(await handleDeliveredSignal({ orderId: "o", statusCode: 700, deliveredAt: fresh }, deps())).toBe("blocked-by-order-status");
    expect(notify).not.toHaveBeenCalled();
  });

  it("fresh delivery flips and notifies once", async () => {
    state.orders.set("o", "shipped");
    expect(await handleDeliveredSignal({ orderId: "o", statusCode: 700, deliveredAt: fresh }, deps())).toBe("delivered-transition");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(await handleDeliveredSignal({ orderId: "o", statusCode: 700, deliveredAt: fresh }, deps())).toBe("already-delivered");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("stale delivery flips status but does not notify", async () => {
    state.orders.set("o", "shipped");
    expect(await handleDeliveredSignal({ orderId: "o", statusCode: 700, deliveredAt: stale }, deps())).toBe("delivered-transition-stale");
    expect(state.orders.get("o")).toBe("delivered");
    expect(notify).not.toHaveBeenCalled();
  });

  it("falls back to the last event time when Delyva delivery time is unknown", async () => {
    state.orders.set("a", "shipped");
    await handleDeliveredSignal({ orderId: "a", statusCode: 700, deliveredAt: null, fallbackEventAt: stale }, deps());
    expect(notify).not.toHaveBeenCalled();
    state.orders.set("b", "shipped");
    await handleDeliveredSignal({ orderId: "b", statusCode: 700, deliveredAt: null, fallbackEventAt: fresh }, deps());
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("no timing info at all: flips, does not notify (conservative)", async () => {
    state.orders.set("o", "shipped");
    await handleDeliveredSignal({ orderId: "o", statusCode: 700 }, deps());
    expect(state.orders.get("o")).toBe("delivered");
    expect(notify).not.toHaveBeenCalled();
  });

  it("webhook + tracking page + poller racing => exactly one notification", async () => {
    state.orders.set("o", "shipped");
    const call = () => handleDeliveredSignal({ orderId: "o", statusCode: 700, deliveredAt: fresh }, deps());
    const results = await Promise.all([call(), call(), call()]);
    expect(results.filter((r) => r === "delivered-transition")).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("a throwing notify never undoes or blocks the status flip", async () => {
    state.orders.set("o", "shipped");
    notify.mockImplementation(() => {
      throw new Error("whatsapp down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      handleDeliveredSignal({ orderId: "o", statusCode: 700, deliveredAt: fresh }, deps()),
    ).resolves.toBe("delivered-transition");
    expect(state.orders.get("o")).toBe("delivered");
    spy.mockRestore();
  });
});

describe("helpers", () => {
  it("isFreshDelivery boundary", () => {
    const now = new Date("2026-09-20T12:00:00Z");
    expect(isFreshDelivery(new Date(now.getTime() - 24 * H), now)).toBe(true);
    expect(isFreshDelivery(new Date(now.getTime() - 24 * H - 1), now)).toBe(false);
    expect(isFreshDelivery(null, now)).toBe(false);
    expect(isFreshDelivery(new Date("garbage"), now)).toBe(false);
  });

  it("deliveredAtFromTracking picks the latest delivered scan, ignores 900/others", () => {
    const d = deliveredAtFromTracking([
      { statusCode: 500, at: "2026-09-20T01:00:00Z" },
      { statusCode: 700, at: "2026-09-20T05:00:00Z" },
      { statusCode: 900, at: "2026-09-20T09:00:00Z" },
    ]);
    expect(d?.toISOString()).toBe("2026-09-20T05:00:00.000Z");
    expect(deliveredAtFromTracking(undefined)).toBeNull();
    expect(deliveredAtFromTracking([{ statusCode: 110, at: "2026-09-20T01:00:00Z" }])).toBeNull();
  });
});
