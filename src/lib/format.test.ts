import { describe, it, expect } from "vitest";
import { formatFromTier } from "./format";

describe("formatFromTier", () => {
  it("returns 'From RM 7.00' for tier {1:7,2:9}", () => {
    expect(formatFromTier({ "1": 7, "2": 9 })).toBe("From RM 7.00");
  });

  it("returns 'Coming soon' for empty object", () => {
    expect(formatFromTier({})).toBe("Coming soon");
  });

  it("returns 'Coming soon' for null", () => {
    expect(formatFromTier(null)).toBe("Coming soon");
  });

  it("uses smallest numeric key when no tier 1 exists — {2:9,3:12} → 'From RM 9.00'", () => {
    expect(formatFromTier({ "2": 9, "3": 12 })).toBe("From RM 9.00");
  });

  it("delegates decimal formatting to formatMYR — {1:7.5} → 'From RM 7.50'", () => {
    expect(formatFromTier({ "1": 7.5 })).toBe("From RM 7.50");
  });
});
