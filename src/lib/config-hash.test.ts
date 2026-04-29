/**
 * Phase 19 (19-08) — RED tests for config-hash helpers.
 * Run: npx vitest run config-hash
 */

import { describe, it, expect } from "vitest";
import { stableStringify, hashConfigurationData } from "./config-hash";
import type { ConfigurationData } from "./config-fields";

describe("stableStringify", () => {
  it("produces same output regardless of key insertion order (shallow)", () => {
    const a = stableStringify({ a: 1, b: 2 });
    const b = stableStringify({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("produces same output regardless of key insertion order (nested)", () => {
    const a = stableStringify({ a: { x: 1, y: 2 } });
    const b = stableStringify({ a: { y: 2, x: 1 } });
    expect(a).toBe(b);
  });

  it("preserves array element order (NOT sorted)", () => {
    const a = stableStringify([3, 1, 2]);
    expect(a).toBe("[3,1,2]");
  });
});

describe("hashConfigurationData", () => {
  const c1: ConfigurationData = {
    values: { name: "JACOB", colour: "red" },
    computedPrice: 18,
    computedSummary: '"JACOB" (5 letters) · Red base',
  };

  it("same config with same key order → same hash", () => {
    const h1 = hashConfigurationData(c1);
    const h2 = hashConfigurationData({ ...c1 });
    expect(h1).toBe(h2);
  });

  it("same config with different values key order → same hash (key order independent)", () => {
    const c2: ConfigurationData = {
      values: { colour: "red", name: "JACOB" }, // keys swapped
      computedPrice: 18,
      computedSummary: '"JACOB" (5 letters) · Red base',
    };
    expect(hashConfigurationData(c1)).toBe(hashConfigurationData(c2));
  });

  it("different values → different hash", () => {
    const c3: ConfigurationData = {
      values: { name: "JACOC", colour: "red" }, // last char changed
      computedPrice: 18,
      computedSummary: '"JACOC" (5 letters) · Red base',
    };
    expect(hashConfigurationData(c1)).not.toBe(hashConfigurationData(c3));
  });

  it("returns a hex string of length 8", () => {
    const h = hashConfigurationData(c1);
    expect(typeof h).toBe("string");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});
