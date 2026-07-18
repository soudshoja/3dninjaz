/**
 * Phase 19 (19-09) — RED tests for ensureOrderItemConfigData parse helper.
 * Run: npx vitest run config-fields
 */

import { describe, it, expect } from "vitest";
import {
  ensureOrderItemConfigData,
  ensureKeycapSequence,
  KeycapSeqConfigSchema,
  lookupTierPriceBySlotCount,
  buildKeycapSequenceSummary,
  lookupTierPrice,
  type KeycapSlot,
} from "./config-fields";

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

// ============================================================================
// Phase 25 (25-01) — keycapseq field contract
// ============================================================================

describe("ensureKeycapSequence", () => {
  it("parses a JSON string of mixed letter+icon slots", () => {
    const raw = '[{"t":"L","ch":"S"},{"t":"I","id":"alien"}]';
    expect(ensureKeycapSequence(raw)).toEqual([
      { t: "L", ch: "S" },
      { t: "I", id: "alien" },
    ]);
  });

  it("returns [] for empty string, null, and non-JSON (never throws)", () => {
    expect(ensureKeycapSequence("")).toEqual([]);
    expect(ensureKeycapSequence(null)).toEqual([]);
    expect(ensureKeycapSequence(undefined)).toEqual([]);
    expect(ensureKeycapSequence("not json")).toEqual([]);
  });

  it("drops only malformed slots and keeps valid ones", () => {
    const raw = JSON.stringify([
      { t: "L", ch: "S" }, // valid
      { t: "L" }, // missing ch → drop
      { t: "L", ch: "AB" }, // ch length !== 1 → drop
      { t: "I", id: "alien" }, // valid
      { t: "I", id: "" }, // empty id → drop
      { t: "X", ch: "Z" }, // unknown type → drop
    ]);
    expect(ensureKeycapSequence(raw)).toEqual([
      { t: "L", ch: "S" },
      { t: "I", id: "alien" },
    ]);
  });

  it("accepts an already-parsed array (mirrors ensureImagesV2)", () => {
    const arr = [
      { t: "L", ch: "A" },
      { t: "I", id: "skull" },
    ];
    expect(ensureKeycapSequence(arr)).toEqual([
      { t: "L", ch: "A" },
      { t: "I", id: "skull" },
    ]);
  });
});

describe("KeycapSeqConfigSchema", () => {
  it("parses a valid config", () => {
    const cfg = {
      maxSlots: 8,
      allowedChars: "A-Z",
      uppercase: true,
      profanityCheck: true,
      allowedIconIds: [] as string[],
    };
    expect(KeycapSeqConfigSchema.parse(cfg)).toEqual(cfg);
  });

  it("rejects maxSlots:0", () => {
    expect(() =>
      KeycapSeqConfigSchema.parse({
        maxSlots: 0,
        allowedChars: "A-Z",
        uppercase: true,
        profanityCheck: true,
        allowedIconIds: [],
      }),
    ).toThrow();
  });
});

describe("lookupTierPriceBySlotCount", () => {
  it("keys off the slot count", () => {
    expect(lookupTierPriceBySlotCount({ "2": 10, "6": 30 }, 6)).toBe(30);
  });

  it("returns null for an unknown count", () => {
    expect(lookupTierPriceBySlotCount({ "2": 10, "6": 30 }, 5)).toBeNull();
  });
});

describe("buildKeycapSequenceSummary", () => {
  it("produces the mixed human summary", () => {
    const slots: KeycapSlot[] = [
      { t: "L", ch: "S" },
      { t: "L", ch: "O" },
      { t: "L", ch: "U" },
      { t: "L", ch: "D" },
      { t: "I", id: "alien" },
      { t: "I", id: "skull" },
    ];
    expect(buildKeycapSequenceSummary(slots, { alien: "Alien", skull: "Skull" })).toBe(
      '"SOUD" + [Alien] + [Skull] (6 keycaps: 4 letters, 2 icons)',
    );
  });

  it("returns empty string for an empty sequence", () => {
    expect(buildKeycapSequenceSummary([], {})).toBe("");
  });

  it("falls back to the id string for an unknown icon", () => {
    const slots: KeycapSlot[] = [{ t: "I", id: "mystery" }];
    expect(buildKeycapSequenceSummary(slots, {})).toBe("[mystery] (1 keycap: 0 letters, 1 icon)");
  });
});

describe("lookupTierPrice (unchanged — still keys off value.length)", () => {
  it("keys off string length", () => {
    expect(lookupTierPrice({ "5": 18 }, "JACOB")).toBe(18);
    expect(lookupTierPrice({ "5": 18 }, "MIA")).toBeNull();
  });
});
