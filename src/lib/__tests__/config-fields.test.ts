import { describe, it, expect } from "vitest";
import {
  ensureConfigJson,
  ensureTiers,
  ensureImagesV2,
  ensureConfigurationData,
  lookupTierPrice,
} from "../config-fields";

// ---------------------------------------------------------------------------
// ensureConfigJson
// ---------------------------------------------------------------------------

describe("ensureConfigJson", () => {
  it("parses a valid text config from JSON string", () => {
    const result = ensureConfigJson(
      "text",
      '{"maxLength":8,"allowedChars":"A-Z","uppercase":true,"profanityCheck":true}',
    );
    expect(result).toEqual({
      maxLength: 8,
      allowedChars: "A-Z",
      uppercase: true,
      profanityCheck: true,
    });
  });

  it("throws on text config with invalid maxLength (negative)", () => {
    expect(() =>
      ensureConfigJson("text", '{"maxLength":-1,"allowedChars":"A-Z","uppercase":true,"profanityCheck":false}'),
    ).toThrow();
  });

  it("parses a valid colour config", () => {
    const result = ensureConfigJson(
      "colour",
      '{"allowedColorIds":["a","b","c"]}',
    );
    expect(result).toEqual({ allowedColorIds: ["a", "b", "c"] });
  });

  it("parses a valid select config with optional priceAdd", () => {
    const result = ensureConfigJson(
      "select",
      '{"options":[{"label":"Red","value":"red"},{"label":"Blue","value":"blue","priceAdd":2}]}',
    );
    expect(result).toEqual({
      options: [
        { label: "Red", value: "red" },
        { label: "Blue", value: "blue", priceAdd: 2 },
      ],
    });
  });

  it("throws when fieldType and payload are mismatched (colour + text JSON)", () => {
    expect(() =>
      ensureConfigJson(
        "colour",
        '{"maxLength":8,"allowedChars":"A-Z","uppercase":true,"profanityCheck":true}',
      ),
    ).toThrow();
  });

  it("parses a valid number config", () => {
    const result = ensureConfigJson(
      "number",
      '{"min":1,"max":100,"step":1}',
    );
    expect(result).toEqual({ min: 1, max: 100, step: 1 });
  });
});

// ---------------------------------------------------------------------------
// ensureTiers
// ---------------------------------------------------------------------------

describe("ensureTiers", () => {
  it("parses a valid tiers JSON string", () => {
    expect(ensureTiers('{"1":7,"2":9,"3":12}')).toEqual({ "1": 7, "2": 9, "3": 12 });
  });

  it("returns {} for null input", () => {
    expect(ensureTiers(null)).toEqual({});
  });

  it("returns {} for garbage string", () => {
    expect(ensureTiers("garbage")).toEqual({});
  });

  it("accepts an already-parsed object", () => {
    expect(ensureTiers({ "1": 7 })).toEqual({ "1": 7 });
  });
});

// ---------------------------------------------------------------------------
// ensureImagesV2
// ---------------------------------------------------------------------------

describe("ensureImagesV2", () => {
  it("promotes old string[] shape to ImageEntryV2[]", () => {
    expect(ensureImagesV2(["a.jpg", "b.jpg"])).toEqual([
      { url: "a.jpg" },
      { url: "b.jpg" },
    ]);
  });

  it("parses new object shape from JSON string", () => {
    expect(ensureImagesV2('[{"url":"a.jpg","caption":"hi"}]')).toEqual([
      { url: "a.jpg", caption: "hi" },
    ]);
  });

  it("returns [] for null input", () => {
    expect(ensureImagesV2(null)).toEqual([]);
  });

  it("returns [] for garbage string", () => {
    expect(ensureImagesV2("garbage")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// lookupTierPrice
// ---------------------------------------------------------------------------

describe("lookupTierPrice", () => {
  const tiers = { "1": 7, "2": 9, "3": 12 };

  it("returns price for value with length matching a tier key", () => {
    expect(lookupTierPrice(tiers, "AB")).toBe(9); // length 2
  });

  it("returns null when length has no matching tier key", () => {
    expect(lookupTierPrice(tiers, "ABCD")).toBeNull(); // length 4, no "4" key
  });

  it("returns null for empty string", () => {
    expect(lookupTierPrice(tiers, "")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ensureConfigurationData
// ---------------------------------------------------------------------------

describe("ensureConfigurationData", () => {
  it("parses a valid configurationData JSON string", () => {
    const result = ensureConfigurationData(
      '{"values":{"f1":"JACOB"},"computedPrice":18,"computedSummary":"JACOB (5 letters)"}',
    );
    expect(result).toEqual({
      values: { f1: "JACOB" },
      computedPrice: 18,
      computedSummary: "JACOB (5 letters)",
    });
  });

  it("returns null for null input", () => {
    expect(ensureConfigurationData(null)).toBeNull();
  });

  it("returns null for empty object string (missing required keys)", () => {
    expect(ensureConfigurationData("{}")).toBeNull();
  });
});
