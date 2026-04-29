/**
 * Phase 19 (19-09) — RED tests for ensureOrderItemConfigData parse helper.
 * Run: npx vitest run config-fields
 */

import { describe, it, expect } from "vitest";
import { ensureOrderItemConfigData } from "./config-fields";

describe("ensureOrderItemConfigData", () => {
  it("returns null for null input", () => {
    expect(ensureOrderItemConfigData(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(ensureOrderItemConfigData(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(ensureOrderItemConfigData("")).toBeNull();
  });

  it("returns null for non-JSON string", () => {
    expect(ensureOrderItemConfigData("not json")).toBeNull();
  });

  it("parses a valid JSON string into ConfigurationData", () => {
    const raw = '{"values":{"f1":"JACOB"},"computedPrice":18,"computedSummary":"JACOB"}';
    const result = ensureOrderItemConfigData(raw);
    expect(result).not.toBeNull();
    expect(result?.values).toEqual({ f1: "JACOB" });
    expect(result?.computedPrice).toBe(18);
    expect(result?.computedSummary).toBe("JACOB");
  });

  it("returns null when computedPrice is not a number", () => {
    const raw = '{"values":{},"computedPrice":"oops","computedSummary":"x"}';
    expect(ensureOrderItemConfigData(raw)).toBeNull();
  });

  it("returns null when values key is missing", () => {
    const raw = '{"computedPrice":18,"computedSummary":"x"}';
    expect(ensureOrderItemConfigData(raw)).toBeNull();
  });

  it("accepts a pre-parsed object (defensive against future mysql2 auto-parse)", () => {
    const obj = { values: { name: "MIA" }, computedPrice: 25, computedSummary: "MIA (3 letters)" };
    const result = ensureOrderItemConfigData(obj);
    expect(result).not.toBeNull();
    expect(result?.values).toEqual({ name: "MIA" });
    expect(result?.computedPrice).toBe(25);
  });
});
