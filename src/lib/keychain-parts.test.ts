/**
 * Vitest-style unit tests for parseKeychainParts.
 *
 * Run with: npx vitest src/lib/keychain-parts.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  parseKeychainParts as parse,
  parseKeycapSequence,
} from "./keychain-parts";

// No mock needed — makeCfg emits valid ConfigurationData JSON, which the real
// ensureOrderItemConfigData parses directly.
function makeCfg(summary: string): string {
  return JSON.stringify({
    values: {},
    computedPrice: 0,
    computedSummary: summary,
  });
}

// Structured path — emit a ConfigurationData whose `values[seqFieldId]` holds
// the JSON-encoded keycap slot array (MariaDB LONGTEXT string-in-string).
const SEQ_FIELD = "keycapseq-field-id";
function makeSeqCfg(slots: unknown, seqFieldId: string = SEQ_FIELD): string {
  return JSON.stringify({
    values: { [seqFieldId]: JSON.stringify(slots) },
    computedPrice: 0,
    computedSummary: "",
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

describe("parseKeycapSequence (structured mixed letter+icon path)", () => {
  it("parses a mixed letter+icon sequence with split counts and preserved order", () => {
    const result = parseKeycapSequence(
      makeSeqCfg([
        { t: "L", ch: "S" },
        { t: "L", ch: "O" },
        { t: "I", id: "alien" },
        { t: "I", id: "skull" },
      ]),
      SEQ_FIELD,
    );
    expect(result).not.toBeNull();
    expect(result?.slotCount).toBe(4);
    expect(result?.letterCount).toBe(2);
    expect(result?.iconCount).toBe(2);
    expect(result?.letters).toEqual(["S", "O"]);
    expect(result?.icons).toEqual(["alien", "skull"]);
    // order preserved across the mixed slots array
    expect(result?.slots.map((s) => s.t)).toEqual(["L", "L", "I", "I"]);
  });

  it("counts an all-letter sequence with iconCount 0 and empty icons", () => {
    const result = parseKeycapSequence(
      makeSeqCfg([
        { t: "L", ch: "J" },
        { t: "L", ch: "A" },
        { t: "L", ch: "C" },
      ]),
      SEQ_FIELD,
    );
    expect(result).not.toBeNull();
    expect(result?.slotCount).toBe(3);
    expect(result?.letterCount).toBe(3);
    expect(result?.letterCount).toBe(result?.slotCount);
    expect(result?.iconCount).toBe(0);
    expect(result?.icons).toEqual([]);
    expect(result?.letters).toEqual(["J", "A", "C"]);
  });

  it("counts an icon-only sequence with letterCount 0 and empty letters", () => {
    const result = parseKeycapSequence(
      makeSeqCfg([
        { t: "I", id: "heart" },
        { t: "I", id: "star" },
      ]),
      SEQ_FIELD,
    );
    expect(result).not.toBeNull();
    expect(result?.slotCount).toBe(2);
    expect(result?.iconCount).toBe(2);
    expect(result?.iconCount).toBe(result?.slotCount);
    expect(result?.letterCount).toBe(0);
    expect(result?.letters).toEqual([]);
    expect(result?.icons).toEqual(["heart", "star"]);
  });

  it("returns null when the keycapseq field value is absent (caller falls back to legacy parse)", () => {
    // ConfigurationData present but has no value under the seq field id.
    const cfg = JSON.stringify({ values: {}, computedPrice: 0, computedSummary: "" });
    expect(parseKeycapSequence(cfg, SEQ_FIELD)).toBeNull();
  });

  it("returns null for an empty sequence array", () => {
    expect(parseKeycapSequence(makeSeqCfg([]), SEQ_FIELD)).toBeNull();
  });

  it("returns null for null/absent configurationData", () => {
    expect(parseKeycapSequence(null, SEQ_FIELD)).toBeNull();
    expect(parseKeycapSequence(undefined, SEQ_FIELD)).toBeNull();
    expect(parseKeycapSequence("", SEQ_FIELD)).toBeNull();
  });

  it("drops malformed slots via the fail-soft decoder, keeping valid ones", () => {
    const result = parseKeycapSequence(
      makeSeqCfg([
        { t: "L", ch: "A" },
        { t: "L", ch: "" },        // invalid — empty char, dropped
        { t: "I", id: "" },        // invalid — empty id, dropped
        { t: "X", ch: "?" },       // invalid — unknown type, dropped
        { t: "I", id: "cat" },
      ]),
      SEQ_FIELD,
    );
    expect(result).not.toBeNull();
    expect(result?.slotCount).toBe(2);
    expect(result?.letterCount).toBe(1);
    expect(result?.iconCount).toBe(1);
    expect(result?.letters).toEqual(["A"]);
    expect(result?.icons).toEqual(["cat"]);
  });
});
