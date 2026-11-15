import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const queue: unknown[][] = [];
/** Queue this to make the next query reject (e.g. a table that is not there yet). */
const FAIL = Object.assign([], { fail: true }) as unknown as unknown[];
vi.mock("@/lib/db", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const next = queue.shift() ?? [];
      if ((next as unknown as { fail?: boolean }).fail) return reject(new Error("boom"));
      return resolve(next);
    };
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

  describe("option (variant) costs", () => {
    const opt = (fieldId: string, optionValue: string, costPrice: string) => ({
      productId: "s1",
      fieldId,
      optionValue,
      costPrice,
    });

    it("uses the chosen Select option's own cost instead of the product cost", async () => {
      queue.push([simple], [opt("f9", "large", "8.50")]);
      const r = await resolveUnitCost({ productId: "s1", configValues: { f9: "large" } });
      expect(r).toEqual({ unitCost: 8.5, source: "snapshot" });
    });

    it("falls back to the product cost when the chosen option has no cost", async () => {
      queue.push([simple], [opt("f9", "large", "8.50")]);
      const r = await resolveUnitCost({ productId: "s1", configValues: { f9: "small" } });
      expect(r.unitCost).toBe(5);
    });

    it("falls back to the product cost when the product has no option costs at all", async () => {
      queue.push([simple], []);
      const r = await resolveUnitCost({ productId: "s1", configValues: { f9: "small" } });
      expect(r.unitCost).toBe(5);
    });

    it("an option cost works even when the product itself has no cost", async () => {
      queue.push([{ ...simple, costPrice: null }], [opt("f9", "large", "8.50")]);
      const r = await resolveUnitCost({ productId: "s1", configValues: { f9: "large" } });
      expect(r.unitCost).toBe(8.5);
    });

    it("keeps the keychain extra-keycap add-on on top of an option base cost", async () => {
      queue.push([keychain], [{ ...opt("f9", "gold", "4.00"), productId: "k1" }]);
      const r = await resolveUnitCost({
        productId: "k1",
        unitCount: 3,
        configValues: { f9: "gold" },
      });
      expect(r.unitCost).toBe(5.6); // 4.00 + 2 * 0.80
    });

    it("never breaks checkout when the option cost table is unavailable", async () => {
      queue.push([simple], FAIL);
      const r = await resolveUnitCost({ productId: "s1", configValues: { f9: "large" } });
      expect(r.unitCost).toBe(5);
    });

    it("does not look up option costs for lines without a configuration", async () => {
      queue.push([simple], [opt("f9", "large", "8.50")]);
      const r = await resolveUnitCost({ productId: "s1" });
      expect(r.unitCost).toBe(5);
      expect(queue.length).toBe(1); // the option query never ran
    });

    it("a real variant cost still wins over an option cost", async () => {
      queue.push(
        [simple],
        [{ id: "v1", productId: "s1", costPrice: "2.20" }],
        [opt("f9", "large", "8.50")],
      );
      const r = await resolveUnitCost({
        productId: "s1",
        variantId: "v1",
        configValues: { f9: "large" },
      });
      expect(r.unitCost).toBe(2.2);
    });
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
