import { describe, it, expect } from "vitest";
import {
  applyBulkMode,
  computeMargin,
  deriveUnitCount,
  parseMoney,
  representativePrice,
  tierPreview,
  unitCostFromFields,
} from "./product-cost-math";

describe("parseMoney", () => {
  it("accepts plain, RM-prefixed and comma amounts", () => {
    expect(parseMoney("3.5")).toBe(3.5);
    expect(parseMoney("RM 12.50")).toBe(12.5);
    expect(parseMoney("1,234.5")).toBe(1234.5);
    expect(parseMoney(0)).toBe(0);
  });
  it("rejects empty, negative and non-numeric input", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-1")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
    expect(parseMoney(-3)).toBeNull();
  });
});

describe("unitCostFromFields", () => {
  it("returns null when there is no base cost", () => {
    expect(
      unitCostFromFields({ productType: "keychain", costPrice: null, costPerExtraUnit: 1, unitCount: 3 }),
    ).toBeNull();
  });
  it("adds (count-1) * extra for keychains", () => {
    expect(
      unitCostFromFields({ productType: "keychain", costPrice: 3, costPerExtraUnit: 0.8, unitCount: 4 }),
    ).toBe(5.4);
  });
  it("costs a keychain as 1 keycap when there is no extra cost or no count", () => {
    expect(
      unitCostFromFields({ productType: "keychain", costPrice: 3, costPerExtraUnit: null, unitCount: 4 }),
    ).toBe(3);
    expect(
      unitCostFromFields({ productType: "keychain", costPrice: 3, costPerExtraUnit: 0.8, unitCount: null }),
    ).toBe(3);
  });
  it("ignores the extra cost for non-keychain products", () => {
    expect(
      unitCostFromFields({ productType: "simple", costPrice: 3, costPerExtraUnit: 0.8, unitCount: 4 }),
    ).toBe(3);
  });
});

describe("deriveUnitCount", () => {
  it("uses the text length for text unit fields", () => {
    expect(deriveUnitCount("f1", { f1: "SOUD" })).toBe(4);
  });
  it("uses the slot count for keycapseq values", () => {
    const seq = JSON.stringify([
      { t: "L", ch: "S" },
      { t: "I", id: "alien" },
      { t: "L", ch: "D" },
    ]);
    expect(deriveUnitCount("f1", { f1: seq })).toBe(3);
  });
  it("returns null without a unit field or value", () => {
    expect(deriveUnitCount(null, { f1: "A" })).toBeNull();
    expect(deriveUnitCount("f1", {})).toBeNull();
    expect(deriveUnitCount("f1", { f1: "" })).toBeNull();
  });
});

describe("margin + preview", () => {
  it("computes margin amount and percent", () => {
    expect(computeMargin(10, 4)).toEqual({ amount: 6, pct: 60 });
    expect(computeMargin(10, null)).toBeNull();
    expect(computeMargin(0, 1)).toEqual({ amount: -1, pct: null });
  });
  it("builds a per-tier keychain preview", () => {
    const rows = tierPreview({ "1": 7, "2": 9, "3": 11 }, 3, 1);
    expect(rows.map((r) => r.cost)).toEqual([3, 4, 5]);
    expect(rows[2].margin?.amount).toBe(6);
  });
  it("picks a representative price", () => {
    expect(
      representativePrice({ productType: "stocked", variantPrices: ["9.00", "7.50"], priceTiers: null }),
    ).toBe(7.5);
    expect(
      representativePrice({ productType: "keychain", variantPrices: [], priceTiers: { "2": 9, "1": 7 } }),
    ).toBe(7);
  });
});

describe("applyBulkMode", () => {
  it("sets an exact cost", () => {
    expect(applyBulkMode({ kind: "set", amount: 2.5 }, 10, null)).toBe(2.5);
  });
  it("computes cost as a percent of price and needs a price", () => {
    expect(applyBulkMode({ kind: "percent_of_price", percent: 40 }, 10, null)).toBe(4);
    expect(applyBulkMode({ kind: "percent_of_price", percent: 40 }, null, null)).toBeNull();
  });
  it("raises or lowers an existing cost and clamps at zero", () => {
    expect(applyBulkMode({ kind: "adjust_rm", delta: 0.5 }, 10, 3)).toBe(3.5);
    expect(applyBulkMode({ kind: "adjust_rm", delta: -5 }, 10, 3)).toBe(0);
    expect(applyBulkMode({ kind: "adjust_percent", percent: 10 }, 10, 3)).toBe(3.3);
    expect(applyBulkMode({ kind: "adjust_percent", percent: 10 }, 10, null)).toBeNull();
  });
});
