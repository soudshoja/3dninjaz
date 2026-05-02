"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  products,
  productConfigFields,
} from "@/lib/db/schema";
import { eq, asc, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  ensureConfigJson,
  ensureTiers,
  TextFieldConfigSchema,
  NumberFieldConfigSchema,
  ColourFieldConfigSchema,
  SelectFieldConfigSchema,
  TextareaFieldConfigSchema,
  type FieldType,
  type AnyFieldConfig,
  type TextareaFieldConfig,
} from "@/lib/config-fields";
// Quick task 260430-icx — textarea sanitisation at the action layer.
// Server-only import; importing into a client module fails at build time.
import { sanitizeRichText } from "@/lib/rich-text-sanitizer";

// ============================================================================
// Types
// ============================================================================

export type ConfigField = {
  id: string;
  productId: string;
  position: number;
  fieldType: FieldType;
  label: string;
  helpText: string | null;
  required: boolean;
  locked: boolean;
  config: AnyFieldConfig;
  createdAt: Date;
  updatedAt: Date;
};

// ============================================================================
// Internal helpers
// ============================================================================

function pickSchemaByFieldType(t: FieldType) {
  switch (t) {
    case "text":
      return TextFieldConfigSchema;
    case "number":
      return NumberFieldConfigSchema;
    case "colour":
      return ColourFieldConfigSchema;
    case "select":
      return SelectFieldConfigSchema;
    case "textarea":
      return TextareaFieldConfigSchema;
  }
}

/**
 * Quick task 260430-icx — defence-in-depth sanitisation for textarea config.
 * Mutates the html field of a TextareaFieldConfig through sanitize-html
 * (server-only). Idempotent: passing already-sanitised HTML returns the same
 * string. Caller should re-run on every save (admin add + admin update).
 */
function sanitizeTextareaConfig(cfg: AnyFieldConfig): AnyFieldConfig {
  const t = cfg as Partial<TextareaFieldConfig>;
  if (typeof t.html === "string") {
    return { html: sanitizeRichText(t.html) } satisfies TextareaFieldConfig;
  }
  return cfg;
}

function hydrateConfigField(r: typeof productConfigFields.$inferSelect): ConfigField {
  return {
    id: r.id,
    productId: r.productId,
    position: r.position,
    fieldType: r.fieldType as FieldType,
    label: r.label,
    helpText: r.helpText ?? null,
    required: r.required,
    locked: r.locked,
    config: ensureConfigJson(r.fieldType as FieldType, r.configJson),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ============================================================================
// Plan 19-03: updateProductType
// ============================================================================

/**
 * Update the productType for a product.
 *
 * Per user directive "keep all data and switch": no guards, no data-presence
 * checks. Existing variants/config fields stay in the DB as orphan data for
 * the new type — admin can switch back anytime to restore them.
 */
export async function updateProductType(
  productId: string,
  newType: "stocked" | "configurable" | "keychain" | "vending" | "simple",
): Promise<
  | { ok: true }
  | { ok: false; error: "Product not found" }
> {
  await requireAdmin(); // FIRST await — CVE-2025-29927

  const [row] = await db
    .select({ id: products.id, type: products.productType })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!row) return { ok: false as const, error: "Product not found" } as const;
  if (row.type === newType) return { ok: true as const }; // no-op fast path

  await db
    .update(products)
    .set({ productType: newType })
    .where(eq(products.id, productId));

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}/edit`);

  return { ok: true as const };
}

// ============================================================================
// Plan 19-04: getConfiguratorData + CRUD actions
// ============================================================================

/**
 * Fetch all config fields for a product along with product summary.
 * Used by ConfiguratorBuilder RSC + client refetch (Pattern B).
 */
export async function getConfiguratorData(productId: string): Promise<{
  product: {
    id: string;
    name: string;
    slug: string;
    productType: "stocked" | "configurable" | "keychain" | "vending" | "simple";
    maxUnitCount: number | null;
    priceTiers: Record<string, number>;
    unitField: string | null;
  };
  fields: ConfigField[];
}> {
  await requireAdmin();

  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      productType: products.productType,
      maxUnitCount: products.maxUnitCount,
      priceTiersRaw: products.priceTiers,
      unitField: products.unitField,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) throw new Error("Product not found");

  const rows = await db
    .select()
    .from(productConfigFields)
    .where(eq(productConfigFields.productId, productId))
    .orderBy(asc(productConfigFields.position));

  const fields: ConfigField[] = rows.map(hydrateConfigField);

  return {
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      productType: product.productType as "stocked" | "configurable" | "keychain" | "vending",
      maxUnitCount: product.maxUnitCount ?? null,
      priceTiers: ensureTiers(product.priceTiersRaw),
      unitField: product.unitField ?? null,
    },
    fields,
  };
}

/**
 * Add a new config field to a product.
 * Appends at the end (max position + 1).
 */
export async function addConfigField(
  productId: string,
  input: {
    fieldType: FieldType;
    label: string;
    helpText?: string;
    required: boolean;
    config: AnyFieldConfig;
  },
): Promise<{ ok: true; field: ConfigField } | { ok: false; error: string }> {
  await requireAdmin();

  const schema = pickSchemaByFieldType(input.fieldType);
  // Quick task 260430-icx — sanitise textarea HTML BEFORE schema validation
  // so the persisted shape matches the schema's max-length cap (sanitisation
  // can shorten the string by stripping tags).
  const incomingConfig =
    input.fieldType === "textarea" ? sanitizeTextareaConfig(input.config) : input.config;
  const parsed = schema.safeParse(incomingConfig);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid config",
    };
  }

  const id = randomUUID();

  // Get next position: COALESCE(MAX(position), -1) + 1
  const [posRow] = await db
    .select({ pos: sql<number>`COALESCE(MAX(position), -1) + 1` })
    .from(productConfigFields)
    .where(eq(productConfigFields.productId, productId));

  const position = posRow?.pos ?? 0;

  await db.insert(productConfigFields).values({
    id,
    productId,
    position,
    fieldType: input.fieldType,
    label: input.label,
    helpText: input.helpText ?? null,
    required: input.required,
    configJson: JSON.stringify(parsed.data),
  });

  revalidatePath(`/admin/products/${productId}/configurator`);

  const [prod] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (prod) revalidatePath(`/products/${prod.slug}`);

  const [row] = await db
    .select()
    .from(productConfigFields)
    .where(eq(productConfigFields.id, id))
    .limit(1);

  return { ok: true as const, field: hydrateConfigField(row) };
}

/**
 * Update an existing config field (label, helpText, required, config).
 */
export async function updateConfigField(
  fieldId: string,
  patch: Partial<{
    label: string;
    helpText: string | null;
    required: boolean;
    config: AnyFieldConfig;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  // Fetch row to get fieldType for config re-validation
  const [existing] = await db
    .select()
    .from(productConfigFields)
    .where(eq(productConfigFields.id, fieldId))
    .limit(1);

  if (!existing) return { ok: false as const, error: "Field not found" };

  // Re-validate config if provided
  let configJsonString: string | undefined;
  if (patch.config !== undefined) {
    const fieldType = existing.fieldType as FieldType;
    const schema = pickSchemaByFieldType(fieldType);
    // Quick task 260430-icx — re-sanitise textarea HTML on every update.
    const incomingConfig =
      fieldType === "textarea" ? sanitizeTextareaConfig(patch.config) : patch.config;
    const parsed = schema.safeParse(incomingConfig);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Invalid config",
      };
    }
    configJsonString = JSON.stringify(parsed.data);
  }

  const setValues: Partial<typeof productConfigFields.$inferInsert> = {};
  // Locked fields: silently ignore label and fieldType changes — other updates proceed.
  if (patch.label !== undefined && !existing.locked) setValues.label = patch.label;
  if (patch.helpText !== undefined) setValues.helpText = patch.helpText;
  if (patch.required !== undefined) setValues.required = patch.required;
  if (configJsonString !== undefined) setValues.configJson = configJsonString;

  if (Object.keys(setValues).length > 0) {
    await db
      .update(productConfigFields)
      .set(setValues)
      .where(eq(productConfigFields.id, fieldId));
  }

  revalidatePath(`/admin/products/${existing.productId}/configurator`);
  revalidatePath(`/admin/products/${existing.productId}/edit`);

  const [prod] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, existing.productId))
    .limit(1);
  if (prod) revalidatePath(`/products/${prod.slug}`);

  return { ok: true as const };
}

/**
 * Delete a config field by id (idempotent).
 */
export async function deleteConfigField(
  fieldId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  // Get productId + locked flag before delete for revalidation and guard
  const [existing] = await db
    .select({ productId: productConfigFields.productId, locked: productConfigFields.locked })
    .from(productConfigFields)
    .where(eq(productConfigFields.id, fieldId))
    .limit(1);

  if (existing?.locked) {
    return { ok: false as const, error: "Locked field cannot be deleted" };
  }

  await db
    .delete(productConfigFields)
    .where(eq(productConfigFields.id, fieldId));

  if (existing?.productId) {
    revalidatePath(`/admin/products/${existing.productId}/configurator`);

    const [prod] = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, existing.productId))
      .limit(1);
    if (prod) revalidatePath(`/products/${prod.slug}`);
  }

  return { ok: true as const };
}

/**
 * Reorder config fields for a product.
 * Runs in a DB transaction for atomic position updates.
 * orderedIds must exactly match the set of field IDs on the product.
 */
export async function reorderConfigFields(
  productId: string,
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  // Validate that orderedIds exactly matches existing field IDs for this product
  const existing = await db
    .select({ id: productConfigFields.id })
    .from(productConfigFields)
    .where(eq(productConfigFields.productId, productId))
    .limit(1000); // explicit limit; 1000 fields per product is far beyond realistic use

  const existingSet = new Set(existing.map((r) => r.id));
  const orderedSet = new Set(orderedIds);

  if (
    existingSet.size !== orderedSet.size ||
    [...existingSet].some((id) => !orderedSet.has(id))
  ) {
    return {
      ok: false as const,
      error: "orderedIds does not match the current field set for this product",
    };
  }

  // Atomic reorder in a transaction
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(productConfigFields)
        .set({ position: i })
        .where(
          and(
            eq(productConfigFields.id, orderedIds[i]),
            eq(productConfigFields.productId, productId),
          ),
        );
    }
  });

  revalidatePath(`/admin/products/${productId}/configurator`);

  return { ok: true as const };
}

// ============================================================================
// Plan 19-05: saveTierTable
// ============================================================================

/**
 * Save tier pricing for a made-to-order product.
 * Validates: maxUnitCount range, tier key completeness, tier value validity,
 * unitField existence and type.
 */
export async function saveTierTable(
  productId: string,
  maxUnitCount: number,
  priceTiers: Record<string, number>,
  unitField: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  if (!Number.isInteger(maxUnitCount) || maxUnitCount < 1 || maxUnitCount > 200) {
    return {
      ok: false as const,
      error: "maxUnitCount must be an integer between 1 and 200",
    };
  }

  // Tier completeness: keys exactly "1".."maxUnitCount"
  const expectedKeys = Array.from({ length: maxUnitCount }, (_, i) => String(i + 1));
  const actualKeys = Object.keys(priceTiers);
  if (
    actualKeys.length !== expectedKeys.length ||
    !expectedKeys.every((k) => k in priceTiers)
  ) {
    return {
      ok: false as const,
      error: `priceTiers must have exactly keys 1..${maxUnitCount}`,
    };
  }

  for (const k of expectedKeys) {
    const v = priceTiers[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return {
        ok: false as const,
        error: `priceTiers["${k}"] must be a non-negative number`,
      };
    }
  }

  // Validate unitField belongs to this product and is text or number type
  const [field] = await db
    .select({ fieldType: productConfigFields.fieldType })
    .from(productConfigFields)
    .where(
      and(
        eq(productConfigFields.id, unitField),
        eq(productConfigFields.productId, productId),
      ),
    )
    .limit(1);

  if (!field) {
    return {
      ok: false as const,
      error: "unitField does not exist on this product",
    };
  }
  if (field.fieldType !== "text" && field.fieldType !== "number") {
    return {
      ok: false as const,
      error: "unitField must be a text or number field",
    };
  }

  // Find product slug for PDP revalidation
  const [prod] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  await db
    .update(products)
    .set({
      maxUnitCount,
      priceTiers: JSON.stringify(priceTiers),
      unitField,
    })
    .where(eq(products.id, productId));

  revalidatePath(`/admin/products/${productId}/configurator`);
  if (prod) revalidatePath(`/products/${prod.slug}`);

  return { ok: true as const };
}
