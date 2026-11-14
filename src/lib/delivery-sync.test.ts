import { describe, it, expect, vi } from "vitest";

const captured = vi.hoisted(() => ({ where: null as unknown, limit: null as unknown, order: null as unknown }));

vi.mock("@/lib/order-delivery-notify", () => ({ notifyOrderDelivered: vi.fn() }));
vi.mock("@/lib/delyva", () => ({ delyvaApi: { getOrderFast: vi.fn() } }));
vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.where = (c: unknown) => ((captured.where = c), chain);
  chain.orderBy = (o: unknown) => ((captured.order = o), chain);
  chain.limit = async (n: unknown) => ((captured.limit = n), []);
  return { db: chain };
});

import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  runDeliverySync,
  listDeliverySyncCandidates,
  DELIVERY_SYNC_BATCH_CAP,
  type DeliverySyncDeps,
  type SyncCandidate,
} from "./delivery-sync";
import type { OrderDetails } from "@/lib/delyva";

const cand = (n: number): SyncCandidate => ({
  orderId: `order-${n}`,
  delyvaOrderId: `10000${n}`,
  lastTrackingEventAt: null,
  createdAt: new Date("2026-09-19T00:00:00Z"),
});

function makeDeps(over: Partial<DeliverySyncDeps> = {}, cands: SyncCandidate[] = []) {
  const deps: DeliverySyncDeps = {
    listCandidates: vi.fn(async (limit: number) => cands.slice(0, limit)),
    fetchLive: vi.fn(async () => ({ id: 1, statusCode: 500 }) as OrderDetails),
    mirror: vi.fn(async () => {}),
    handle: vi.fn(async () => "not-delivered" as const),
    sleep: vi.fn(async () => {}),
    ...over,
  };
  return deps;
}

describe("listDeliverySyncCandidates (query shape)", () => {
  it("selects only fulfilled orders with a Delyva id, skips 900, caps and orders oldest-checked first", async () => {
    await listDeliverySyncCandidates(25);
    const q = new MySqlDialect().sqlToQuery(captured.where as never);
    expect(q.sql).toMatch(/`status` in \(\?, \?, \?\)/);
    expect(q.params).toEqual(expect.arrayContaining(["paid", "processing", "shipped", 900]));
    expect(q.params).not.toContain("cancelled");
    expect(q.params).not.toContain("pending");
    expect(q.sql).toMatch(/`delyva_order_id` is not null/);
    expect(q.sql).toMatch(/`status_code` is null or .*`status_code` <> \?/);
    expect(captured.limit).toBe(25);
    const ord = new MySqlDialect().sqlToQuery(captured.order as never);
    expect(ord.sql).toMatch(/last_tracking_event_at/);
  });
});

describe("runDeliverySync", () => {
  it("counts checked/delivered, mirrors every parcel and flips only delivered ones", async () => {
    const cands = [cand(1), cand(2), cand(3)];
    const deps = makeDeps(
      {
        fetchLive: vi.fn(async (id: string) =>
          ({ id: 1, statusCode: id === "100002" ? 700 : 500 }) as OrderDetails,
        ),
        handle: vi.fn(async (i) =>
          i.statusCode === 700 ? ("delivered-transition" as const) : ("not-delivered" as const),
        ),
      },
      cands,
    );
    const s = await runDeliverySync(deps, { pauseMs: 1 });
    expect(s).toEqual({ checked: 3, delivered: 1, errors: 0 });
    expect(deps.mirror).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledTimes(2); // pause between calls only
  });

  it("survives one failing parcel", async () => {
    const deps = makeDeps(
      {
        fetchLive: vi.fn(async (id: string) => {
          if (id === "100002") throw new Error("boom");
          return { id: 1, statusCode: 700 } as OrderDetails;
        }),
        handle: vi.fn(async () => "delivered-transition" as const),
      },
      [cand(1), cand(2), cand(3)],
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await runDeliverySync(deps, { pauseMs: 0 });
    warn.mockRestore();
    expect(s).toEqual({ checked: 3, delivered: 2, errors: 1 });
  });

  it("a failing mirror does not stop the delivery decision", async () => {
    const deps = makeDeps(
      {
        mirror: vi.fn(async () => {
          throw new Error("db");
        }),
        fetchLive: vi.fn(async () => ({ id: 1, statusCode: 700 }) as OrderDetails),
        handle: vi.fn(async () => "delivered-transition" as const),
      },
      [cand(1)],
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await runDeliverySync(deps, { pauseMs: 0 });
    warn.mockRestore();
    expect(s).toEqual({ checked: 1, delivered: 1, errors: 1 });
  });

  it("900 is logged and left alone (handler never called)", async () => {
    const deps = makeDeps(
      { fetchLive: vi.fn(async () => ({ id: 1, statusCode: 900 }) as OrderDetails) },
      [cand(1)],
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await runDeliverySync(deps, { pauseMs: 0 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(deps.handle).not.toHaveBeenCalled();
    expect(s).toEqual({ checked: 1, delivered: 0, errors: 0 });
  });

  it("respects the cap", async () => {
    const many = Array.from({ length: 60 }, (_, i) => cand(i));
    const deps = makeDeps({}, many);
    const s = await runDeliverySync(deps, { pauseMs: 0 });
    expect(deps.listCandidates).toHaveBeenCalledWith(DELIVERY_SYNC_BATCH_CAP);
    expect(s.checked).toBe(DELIVERY_SYNC_BATCH_CAP);
    expect(deps.fetchLive).toHaveBeenCalledTimes(DELIVERY_SYNC_BATCH_CAP);
  });

  it("passes Delyva delivery time, else previous-check time, as timing evidence", async () => {
    const deps = makeDeps(
      {
        fetchLive: vi.fn(
          async () =>
            ({
              id: 1,
              statusCode: 700,
              tracking: [{ statusCode: 700, at: "2026-09-20T05:00:00Z" }],
            }) as OrderDetails,
        ),
      },
      [cand(1)],
    );
    await runDeliverySync(deps, { pauseMs: 0 });
    const arg = vi.mocked(deps.handle).mock.calls[0][0];
    expect(arg.deliveredAt?.toISOString()).toBe("2026-09-20T05:00:00.000Z");
    expect(arg.fallbackEventAt?.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });
});
