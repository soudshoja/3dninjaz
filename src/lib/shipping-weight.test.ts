/**
 * Quick task 260911-mpw — tests for the grams<->kg shipping-weight helper.
 * Run: npx vitest run src/lib/shipping-weight.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  parseShippingWeightGrams,
  kgToGrams,
  SHIPPING_WEIGHT_MIN_G,
  SHIPPING_WEIGHT_MAX_G,
} from "./shipping-weight";

describe("parseShippingWeightGrams", () => {
  it("parses a normal value", () => {
    const r = parseShippingWeightGrams("300");
    expect(r).toEqual({ ok: true, grams: 300, kg: "0.300" });
  });

  it("parses the minimum boundary", () => {
    const r = parseShippingWeightGrams("1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kg).toBe("0.001");
  });

  it("parses the maximum boundary", () => {
    const r = parseShippingWeightGrams("30000");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kg).toBe("30.000");
  });

  it("trims surrounding whitespace", () => {
    const r = parseShippingWeightGrams(" 250 ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.grams).toBe(250);
  });

  it.each([
    ["empty string", ""],
    ["whitespace only", "  "],
    ["null", null],
    ["undefined", undefined],
    ["zero", "0"],
    ["negative", "-5"],
    ["non-numeric", "abc"],
    ["decimal point", "1.5"],
    ["comma decimal", "1,5"],
    ["scientific notation", "1e3"],
    ["above max", "30001"],
  ])("rejects %s (%s)", (_label, input) => {
    const r = parseShippingWeightGrams(input as string | null | undefined);
    expect(r.ok).toBe(false);
  });

  it("exposes the documented bounds", () => {
    expect(SHIPPING_WEIGHT_MIN_G).toBe(1);
    expect(SHIPPING_WEIGHT_MAX_G).toBe(30000);
  });
});

describe("kgToGrams", () => {
  it("round-trips through parseShippingWeightGrams", () => {
    const parsed = parseShippingWeightGrams("250");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(kgToGrams(parsed.kg)).toBe(250);
    }
  });

  it("converts a decimal string from the DB", () => {
    expect(kgToGrams("0.300")).toBe(300);
  });

  it("converts a number", () => {
    expect(kgToGrams(0.3)).toBe(300);
  });

  it("returns null for null", () => {
    expect(kgToGrams(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(kgToGrams(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(kgToGrams("")).toBeNull();
  });

  it("returns null for NaN-producing input", () => {
    expect(kgToGrams("abc")).toBeNull();
  });
});
