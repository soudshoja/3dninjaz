/**
 * Phase 19 (19-02) — Config-fields parse/validate helpers + Zod schemas.
 *
 * EVERY site that reads products.priceTiers, product_config_fields.configJson,
 * products.images (any shape), or order_items.configuration_data MUST use
 * the helpers here. MariaDB 10.11 returns JSON columns as LONGTEXT strings —
 * these helpers normalise the round-trip so callers never see raw strings.
 *
 * Exports:
 *   Zod schemas (4):  TextFieldConfigSchema, NumberFieldConfigSchema,
 *                     ColourFieldConfigSchema, SelectFieldConfigSchema
 *   Types (5):        TextFieldConfig, NumberFieldConfig, ColourFieldConfig,
 *                     SelectFieldConfig, AnyFieldConfig, FieldType,
 *                     ImageEntryV2, ConfigurationData
 *   Functions (5):    ensureConfigJson, ensureTiers, ensureImagesV2,
 *                     ensureConfigurationData, lookupTierPrice
 */

import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

export type FieldType = "text" | "number" | "colour" | "select";

/** D-03 — text field config */
export type TextFieldConfig = {
  maxLength: number;
  allowedChars: string;
  uppercase: boolean;
  profanityCheck: boolean;
};

/** D-03 — number field config */
export type NumberFieldConfig = {
  min: number;
  max: number;
  step: number;
};

/** D-03 — colour field config */
export type ColourFieldConfig = {
  allowedColorIds: string[];
};

/** D-03 — select field config */
export type SelectFieldConfig = {
  options: Array<{ label: string; value: string; priceAdd?: number }>;
};

export type AnyFieldConfig =
  | TextFieldConfig
  | NumberFieldConfig
  | ColourFieldConfig
  | SelectFieldConfig;

/** D-05 — backwards-compat image entry (old shape = plain string, new = object) */
export type ImageEntryV2 = {
  url: string;
  caption?: string;
  alt?: string;
};

/** D-11 / D-12 — configuration snapshot stored in cart line + order_items */
export type ConfigurationData = {
  values: Record<string, string>; // fieldId -> customer-supplied value
  computedPrice: number;          // MYR at time of add-to-bag
  computedSummary: string;        // human-readable e.g. "JACOB (5 letters) · Red base+chain"
};

// ============================================================================
// Zod schemas (exported for reuse in admin actions)
// ============================================================================

export const TextFieldConfigSchema: z.ZodType<TextFieldConfig> = z.object({
  maxLength: z.number().int().min(1).max(200),
  allowedChars: z.string().min(1),
  uppercase: z.boolean(),
  profanityCheck: z.boolean(),
});

export const NumberFieldConfigSchema: z.ZodType<NumberFieldConfig> = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
});

export const ColourFieldConfigSchema: z.ZodType<ColourFieldConfig> = z.object({
  allowedColorIds: z
    .array(z.string().min(1))
    .min(1),
});

export const SelectFieldConfigSchema: z.ZodType<SelectFieldConfig> = z.object({
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        priceAdd: z.number().optional(),
      }),
    )
    .min(1),
});

// Internal map for dispatch
const schemaByFieldType: Record<FieldType, z.ZodType<AnyFieldConfig>> = {
  text: TextFieldConfigSchema,
  number: NumberFieldConfigSchema,
  colour: ColourFieldConfigSchema,
  select: SelectFieldConfigSchema,
};

// ============================================================================
// ensureConfigJson
// ============================================================================

/**
 * Parse and validate `product_config_fields.configJson` LONGTEXT.
 *
 * Dispatches by fieldType to the correct Zod schema. Returns a typed config
 * object on success. Throws on parse failure or Zod validation error.
 * Callers that want fail-soft behaviour should wrap in try/catch.
 */
export function ensureConfigJson(fieldType: FieldType, raw: unknown): AnyFieldConfig {
  let value: unknown = raw;
  if (typeof raw === "string") {
    value = JSON.parse(raw); // throws SyntaxError on bad JSON
  }
  const schema = schemaByFieldType[fieldType];
  if (!schema) {
    throw new Error(`Unknown fieldType: ${String(fieldType)}`);
  }
  return schema.parse(value); // throws ZodError on validation failure
}

// ============================================================================
// ensureTiers
// ============================================================================

/**
 * Parse `products.priceTiers` LONGTEXT → Record<string, number>.
 *
 * Never throws — returns {} on any error or invalid input.
 * Only numeric values ≥ 0 are kept; string / null / NaN entries are dropped.
 */
export function ensureTiers(raw: unknown): Record<string, number> {
  if (raw === null || raw === undefined) return {};

  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return {};
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return {};

  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      result[k] = v;
    }
  }
  return result;
}

// ============================================================================
// ensureImagesV2
// ============================================================================

/**
 * Parse `products.images` — backwards-compatible with old string[] shape AND
 * new {url, caption?, alt?, widths?, formats?} shape.
 *
 * Old shape:  ["url1", "url2"]              → [{url:"url1"}, {url:"url2"}]
 * New shape:  [{url:"url1", caption:"hi"}]  → kept as-is (url + caption + alt only)
 * Mixed JSON string:  '[...]'               → parse then walk
 *
 * Never throws — returns [] on any error or invalid input.
 */
export function ensureImagesV2(raw: unknown): ImageEntryV2[] {
  if (raw === null || raw === undefined) return [];

  let arr: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(arr)) return [];

  const result: ImageEntryV2[] = [];
  for (const entry of arr) {
    if (typeof entry === "string" && entry.trim() !== "") {
      result.push({ url: entry });
    } else if (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).url === "string" &&
      ((entry as Record<string, unknown>).url as string).trim() !== ""
    ) {
      const e = entry as Record<string, unknown>;
      const img: ImageEntryV2 = { url: e.url as string };
      if (typeof e.caption === "string") img.caption = e.caption;
      if (typeof e.alt === "string") img.alt = e.alt;
      result.push(img);
    }
    // else: drop silently
  }
  return result;
}

// ============================================================================
// ensureConfigurationData
// ============================================================================

const ConfigurationDataSchema = z.object({
  values: z.record(z.string()),
  computedPrice: z.number().nonnegative(),
  computedSummary: z.string(),
});

/**
 * Parse `order_items.configuration_data` LONGTEXT → ConfigurationData | null.
 *
 * Returns null on any parse/validation failure — never throws.
 * Order detail rendering must fail-soft for old/corrupt rows.
 */
export function ensureConfigurationData(raw: unknown): ConfigurationData | null {
  if (raw === null || raw === undefined) return null;

  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return null;
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const result = ConfigurationDataSchema.safeParse(obj);
  return result.success ? result.data : null;
}

// ============================================================================
// lookupTierPrice
// ============================================================================

/**
 * Look up the price for a given unitField value by its string length.
 *
 * Returns null when:
 *   - unitFieldValue is empty / falsy
 *   - length has no matching key in tiers
 *
 * Consumers should disable "Add to bag" when this returns null.
 */
export function lookupTierPrice(
  tiers: Record<string, number>,
  unitFieldValue: string,
): number | null {
  if (!unitFieldValue) return null;
  const v = tiers[String(unitFieldValue.length)];
  return typeof v === "number" ? v : null;
}
