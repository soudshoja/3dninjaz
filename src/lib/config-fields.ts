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

export type FieldType = "text" | "number" | "colour" | "select" | "textarea";

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
  options: Array<{
    label: string;
    value: string;
    /** Additive price (cosmetic display only). Prefer `price` for a true override. */
    priceAdd?: number;
    /** Per-option price override — replaces the tier/flat price when this option is selected. */
    price?: number;
    /** Admin-assigned SKU for this option value (for order fulfilment tracking). */
    sku?: string;
    /** Public URL of the option image (from writeUpload pipeline). */
    imageUrl?: string;
  }>;
};

/**
 * Quick task 260430-icx — textarea (rich text) field config.
 *
 * Admin-authored content rendered read-only on the storefront PDP. Never
 * accepts customer input — it's a description block, not a form field.
 * The `html` string is sanitised at the server boundary via
 * src/lib/rich-text-sanitizer.ts on every save path (defence-in-depth).
 */
export type TextareaFieldConfig = {
  /** Sanitised HTML; admin source-of-truth (allowlisted by sanitize-html). */
  html: string;
};

export type AnyFieldConfig =
  | TextFieldConfig
  | NumberFieldConfig
  | ColourFieldConfig
  | SelectFieldConfig
  | TextareaFieldConfig;

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
  /**
   * Base & Clicker colour hex — snapshotted at add-to-bag for display in cart /
   * order detail without a DB lookup. Optional for backwards compat with cart
   * items created before this field was added.
   */
  baseClickerColor?: string;      // hex e.g. "#39E600"
  baseClickerColorName?: string;  // display name e.g. "Neon Green"
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
  // Allow empty palette — admin can save a colour field without selecting colours
  // yet and configure the palette later. A non-empty palette is only required at
  // storefront render time (PDP validates before showing the field to customers).
  allowedColorIds: z.array(z.string().min(1)),
});

export const SelectFieldConfigSchema: z.ZodType<SelectFieldConfig> = z.object({
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        priceAdd: z.number().optional(),
        price: z.number().nonnegative().optional(),
        sku: z.string().optional(),
        imageUrl: z.string().optional(),
      }),
    )
    .min(1),
});

/**
 * Quick task 260430-icx — textarea config Zod schema.
 * Generous 50_000-char cap to prevent runaway DB rows (LONGTEXT can
 * hold up to 4GB but the PDP UI shouldn't render essays).
 */
export const TextareaFieldConfigSchema: z.ZodType<TextareaFieldConfig> = z.object({
  html: z.string().max(50_000),
});

// Internal map for dispatch
const schemaByFieldType: Record<FieldType, z.ZodType<AnyFieldConfig>> = {
  text: TextFieldConfigSchema,
  number: NumberFieldConfigSchema,
  colour: ColourFieldConfigSchema,
  select: SelectFieldConfigSchema,
  textarea: TextareaFieldConfigSchema,
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
  baseClickerColor: z.string().optional(),
  baseClickerColorName: z.string().optional(),
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
// ensureOrderItemConfigData
// ============================================================================

/**
 * Read-side parse for order_items.configurationData LONGTEXT column.
 *
 * Returns null on parse error or shape mismatch — never throws.
 * Accepts both a raw JSON string (what MariaDB 10.11 returns for LONGTEXT)
 * and a pre-parsed object (defensive for future mysql2 behaviour changes).
 *
 * Used by all four order-render surfaces:
 *   - admin order detail  (/admin/orders/[id])
 *   - customer order detail (/orders/[id])
 *   - invoice PDF          (/orders/[id]/invoice.pdf)
 *   - order-confirmation email
 */
export function ensureOrderItemConfigData(raw: unknown): ConfigurationData | null {
  return ensureConfigurationData(raw);
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
