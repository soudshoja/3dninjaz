import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const queue: unknown[][] = [];
vi.mock("@/lib/db", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => resolve(queue.shift() ?? []);
    return chain;
  };
  return { db: { select: () => makeChain() } };
});

import { resolveUnitCost, resolveUnitCosts, costColumns } from "./product-cost";

const keychain = {
  id: "k1",
  productType: "keychain",
  costPrice: "3.00",
  costPerExtraUnit: "0.80",
  unitField: "f1",
};
const simple = {
  id: "s1",
  productType: "simple",
  costPrice: "5.00",
  costPerExtraUnit: null,
  unitField: null,
};

describe("resolveUnitCost", () => {
  beforeEach(() => {
    queue.length = 0;
  });

  it("uses a real variant cost before the product cost", async () => {
    queue.push([simple], [{ id: "v1", productId: "s1", costPrice: "2.20" }]);
    const r = await resolveUnitCost({ productId: "s1", variantId: "v1" });
    expect(r).toEqual({ unitCost: 2.2, source: "snapshot" });
  });

  it("falls back to the product cost when the variant has no cost", async () => {
    queue.push([simple], [{ id: "v1", productId: "s1", costPrice: null }]);
    const r = await resolveUnitCost({ productId: "s1", variantId: "v1" });
    expect(r.unitCost).toBe(5);
  });

  it("ignores the NONE and manual sentinels and a variant of another product", async () => {
    queue.push([simple]);
    expect((await resolveUnitCost({ productId: "s1", variantId: "NONE" })).unitCost).toBe(5);
    queue.push([simple], [{ id: "vx", productId: "other", costPrice: "1.00" }]);
    expect((await resolveUnitCost({ productId: "s1", variantId: "vx" })).unitCost).toBe(5);
  });

  it("prices a keychain by the server-validated unit count", async () => {
    queue.push([keychain]);
    const r = await resolveUnitCost({ productId: "k1", variantId: "NONE", unitCount: 4 });
    expect(r.unitCost).toBe(5.4);
  });

  it("derives the count from stored config values when no count is given", async () => {
    queue.push([keychain]);
    const r = await resolveUnitCost({
      productId: "k1",
      variantId: null,
      configValues: { f1: "ABC" },
    });
    expect(r.unitCost).toBe(4.6);
  });

  it("returns null for unknown products, manual lines and missing cost", async () => {
    queue.push([]);
    expect((await resolveUnitCost({ productId: "gone" })).unitCost).toBeNull();
    expect((await resolveUnitCost({ productId: "manual" })).unitCost).toBeNull();
    expect((await resolveUnitCost({ productId: null })).unitCost).toBeNull();
    queue.push([{ ...simple, costPrice: null }]);
    expect((await resolveUnitCost({ productId: "s1" })).source).toBeNull();
  });

  it("batches lines in two queries and maps results in order", async () => {
    queue.push([simple, keychain], []);
    const out = await resolveUnitCosts([
      { productId: "k1", unitCount: 2 },
      { productId: "s1" },
    ]);
    expect(out.map((o) => o.unitCost)).toEqual([3.8, 5]);
  });

  it("costColumns returns strings and a source only when a cost exists", () => {
    expect(costColumns({ unitCost: 3.8, source: "snapshot" })).toEqual({
      unitCost: "3.80",
      unitCostSource: "snapshot",
    });
    expect(costColumns({ unitCost: null, source: null })).toEqual({
      unitCost: null,
      unitCostSource: null,
    });
  });
});
