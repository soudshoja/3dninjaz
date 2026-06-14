/**
 * Vitest-style unit tests for parseKeychainParts.
 *
 * Run with: npx vitest src/lib/keychain-parts.test.ts
 */

import { describe, it, expect } from "vitest";
import { parseKeychainParts as parse } from "./keychain-parts";

// No mock needed — makeCfg emits valid ConfigurationData JSON, which the real
// ensureOrderItemConfigData parses directly.
function makeCfg(summary: string): string {
  return JSON.stringify({
    values: {},
    computedPrice: 0,
    computedSummary: summary,
  });
}

describe("parseKeychainParts", () => {
  it("parses the canonical keychain summary", () => {
    const result = parse(
      makeCfg(
        '"ATHIYYA" (7 your name) · Magenta base · Matte Pastel Periwinkle clicker · Matte Pastel Candy letter',
      ),
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("ATHIYYA");
    expect(result?.letters).toBe(7);
    expect(result?.base).toBe("Magenta");
    expect(result?.clicker).toBe("Matte Pastel Periwinkle");
    expect(result?.letter).toBe("Matte Pastel Candy");
  });

  it("returns null for a non-keychain summary (e.g. a shirt)", () => {
    const result = parse(
      makeCfg("T-Shirt · Medium · Red"),
    );
    expect(result).toBeNull();
  });

  it("returns null for null configurationData", () => {
    expect(parse(null)).toBeNull();
    expect(parse(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parse("")).toBeNull();
  });

  it("handles a name with spaces", () => {
    const result = parse(
      makeCfg(
        '"SOUD SHOJA" (10 your name) · Blue base · Glossy Silver clicker · Matte Black letter',
      ),
    );
    expect(result?.name).toBe("SOUD SHOJA");
    expect(result?.letters).toBe(10);
    expect(result?.base).toBe("Blue");
    expect(result?.clicker).toBe("Glossy Silver");
    expect(result?.letter).toBe("Matte Black");
  });

  it("returns empty name string when no quoted name is present", () => {
    const result = parse(
      makeCfg(
        "5 letters · Magenta base · Matte Pastel Periwinkle clicker · Matte Pastel Candy letter",
      ),
    );
    // Parts should still match even without the quoted name
    expect(result).not.toBeNull();
    expect(result?.name).toBe("");
    expect(result?.base).toBe("Magenta");
  });
});
