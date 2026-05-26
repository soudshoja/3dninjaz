/**
 * Unit tests for resolveOptionWeightKg + SelectFieldConfigSchema weight field.
 *
 * No DB, no Delyva — pure function + schema only.
 * Run with: npx vitest run src/lib/__tests__/option-weight-resolution.test.ts
 */

import { describe, it, expect } from "vitest";
import { resolveOptionWeightKg, type FieldWeightEntry } from "@/lib/option-weight";
import { SelectFieldConfigSchema } from "@/lib/config-fields";

// ── Schema sub-block (covers Task 1 behaviour) ────────────────────────────────

describe("SelectFieldConfigSchema — weight field", () => {
  it("parses an option with weight: 250 (backward-compat add)", () => {
    const result = SelectFieldConfigSchema.safeParse({
      options: [{ label: "Small Box", value: "small-box", weight: 250 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options[0].weight).toBe(250);
    }
  });

  it("parses an option WITHOUT weight (backward compatible)", () => {
    const result = SelectFieldConfigSchema.safeParse({
      options: [{ label: "Old Option", value: "old-option" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options[0].weight).toBeUndefined();
    }
  });

  it("rejects a negative weight", () => {
    const result = SelectFieldConfigSchema.safeParse({
      options: [{ label: "X", value: "x", weight: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer weight", () => {
    const result = SelectFieldConfigSchema.safeParse({
      options: [{ label: "X", value: "x", weight: 250.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a weight above 50000", () => {
    const result = SelectFieldConfigSchema.safeParse({
      options: [{ label: "X", value: "x", weight: 50001 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts weight: 0 (weightless option)", () => {
    const result = SelectFieldConfigSchema.safeParse({
      options: [{ label: "Digital", value: "digital", weight: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts weight: 50000 (max bound)", () => {
    const result = SelectFieldConfigSchema.safeParse({
      options: [{ label: "Heavy", value: "heavy", weight: 50000 }],
    });
    expect(result.success).toBe(true);
  });
});

// ── resolveOptionWeightKg unit tests ─────────────────────────────────────────

/**
 * Build a FieldWeightEntry fixture from a plain { value -> grams } map.
 */
function makeField(fieldId: string, optionWeights: Record<string, number>): FieldWeightEntry {
  const optionsByValue = new Map<string, number>(Object.entries(optionWeights));
  return { fieldId, optionsByValue };
}

describe("resolveOptionWeightKg", () => {
  it("returns null when configValues is empty", () => {
    const fields = [makeField("f1", { "small-box": 250, "large-box": 800 })];
    expect(resolveOptionWeightKg({}, fields)).toBeNull();
  });

  it("returns null when no field has weight for the chosen value", () => {
    // Field exists but the chosen option has no weight entry
    const fields = [makeField("f1", { "other-val": 300 })];
    expect(resolveOptionWeightKg({ f1: "no-weight-val" }, fields)).toBeNull();
  });

  it("returns null when fieldsForProduct is empty", () => {
    expect(resolveOptionWeightKg({ f1: "small-box" }, [])).toBeNull();
  });

  it("heavier option yields larger kg than lighter option (money-touching proof)", () => {
    const fields = [makeField("f1", { "option-a": 250, "option-b": 800 })];

    const lightKg = resolveOptionWeightKg({ f1: "option-a" }, fields);
    const heavyKg = resolveOptionWeightKg({ f1: "option-b" }, fields);

    // Both must be non-null (options have weights set)
    expect(lightKg).not.toBeNull();
    expect(heavyKg).not.toBeNull();

    // Heavy must be strictly greater than light
    expect(heavyKg!).toBeGreaterThan(lightKg!);

    // Verify exact kg values (grams / 1000)
    expect(lightKg).toBeCloseTo(0.25, 6);
    expect(heavyKg).toBeCloseTo(0.8, 6);
  });

  it("sums weights across two Select fields on the same product", () => {
    const fields = [
      makeField("field-base",   { "red": 300, "blue": 300 }),
      makeField("field-accent", { "gold": 150, "silver": 150 }),
    ];
    const result = resolveOptionWeightKg(
      { "field-base": "red", "field-accent": "gold" },
      fields,
    );
    // 300g + 150g = 450g = 0.45 kg
    expect(result).toBeCloseTo(0.45, 6);
  });

  it("partial match: sums only the fields that have a weight for the chosen value", () => {
    // field-extra chosen value has no entry in optionsByValue — only field-base contributes
    const fields = [
      makeField("field-base",  { "small": 200 }),
      makeField("field-extra", { "other-val": 100 }), // "unknown" not in map
    ];
    const result = resolveOptionWeightKg(
      { "field-base": "small", "field-extra": "unknown" },
      fields,
    );
    // Only 200g matches → 0.2 kg
    expect(result).toBeCloseTo(0.2, 6);
  });

  it("correctly converts grams to kg (1500g → 1.5 kg)", () => {
    const fields = [makeField("f1", { "xl": 1500 })];
    expect(resolveOptionWeightKg({ f1: "xl" }, fields)).toBeCloseTo(1.5, 6);
  });

  it("ignores fieldIds in configValues that are not present in fieldsForProduct", () => {
    const fields = [makeField("known-field", { "val": 100 })];
    const result = resolveOptionWeightKg(
      { "known-field": "val", "ghost-field": "something" },
      fields,
    );
    // ghost-field not in fieldsForProduct → only known-field's 100g = 0.1 kg
    expect(result).toBeCloseTo(0.1, 6);
  });
});
