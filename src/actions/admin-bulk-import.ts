"use server";

import { db } from "@/lib/db";
import {
  products,
  productVariants,
  productOptions,
  productOptionValues,
  categories,
} from "@/lib/db/schema";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { bulkImportRowSchema } from "@/lib/validators";
import {
  parseCsvStream,
  normalizeCsvRow,
  slugifyForImport,
  type CsvRow,
} from "@/lib/csv";

// ============================================================================
// Phase 16-06 admin bulk product import (CSV) — updated for generic options.
//
// CSV schema (new):
//   name, slug*, description, category_name*, material_type*, estimated_production_days*,
//   option1_name, option1_values (pipe-sep), option1_prices (pipe-sep, aligned),
//   option2_name*, option2_values*, option2_prices*,
//   option3_name*, option3_values*, option3_prices*,
//   image_url_1*, image_url_2*, ...
//
//
// On import: product → options → values → cartesian variant matrix.
// Single transaction; any failure rolls back the entire import.
//
// Threat mitigations:
//   - T-05-05-EoP: requireAdmin() FIRST in every export
//   - T-05-05-injection: parseCsvStream caps file size + row count
//   - T-05-05-SSRF: normalizeCsvRow rejects external URLs
//   - T-05-05-path-traversal: fileName sanitised via regex
//   - T-05-05-state: commit runs inside a single db.transaction
// ============================================================================

// ---------------------------------------------------------------------------
// Option parsing helpers
// ---------------------------------------------------------------------------

type ParsedOption = {
  name: string;
  values: string[];
  prices: (string | null)[]; // aligned to values; null = inherit
};

/** Parse pipe-separated values, trimming whitespace and dropping empties. */
function parsePipe(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Derive the option list from a parsed CSV row.
 * Uses option1_name/values/prices (generic columns introduced in Phase 16-06).
 */
function deriveOptions(z: ReturnType<typeof bulkImportRowSchema.parse>): ParsedOption[] {
  const options: ParsedOption[] = [];

  // ---- Generic option path ----
  for (const slot of [
    { name: z.option1_name, values: z.option1_values, prices: z.option1_prices },
    { name: z.option2_name, values: z.option2_values, prices: z.option2_prices },
    { name: z.option3_name, values: z.option3_values, prices: z.option3_prices },
  ]) {
    if (!slot.name || !slot.values) continue;
    const vals = parsePipe(slot.values);
    if (vals.length === 0) continue;
    const rawPrices = parsePipe(slot.prices);
    const alignedPrices: (string | null)[] = vals.map((_, i) => rawPrices[i] ?? null);
    options.push({ name: slot.name, values: vals, prices: alignedPrices });
  }

  return options;
}

/** Validate option structure and prices; return errors array (empty = valid). */
function validateOptions(opts: ParsedOption[]): string[] {
  const errors: string[] = [];
  if (opts.length === 0) {
    errors.push("At least one option with values is required (option1_name + option1_values)");
    return errors;
  }
  if (opts.length > 3) {
    errors.push("Maximum 3 options per product");
  }
  const priceRegex = /^\d+(\.\d{1,2})?$/;
  for (const opt of opts) {
    if (opt.values.length === 0) {
      errors.push(`option "${opt.name}": no values provided`);
    }
    for (const p of opt.prices) {
      if (p !== null && !priceRegex.test(p)) {
        errors.push(`option "${opt.name}": invalid price "${p}" — must be digits with up to 2 decimal places`);
      }
    }
  }
  // For a cartesian product of options, every combo must have a resolvable price.
  // Only enforce when prices are provided for the primary option.
  const primaryPrices = opts[0]?.prices ?? [];
  const hasSomePrice = primaryPrices.some((p) => p !== null);
  if (!hasSomePrice) {
    errors.push(`option "${opts[0]?.name ?? "1"}": at least one price value is required`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Preview row types
// ---------------------------------------------------------------------------

export type PreviewRowValid = {
  rowIndex: number;
  data: {
    name: string;
    slug: string;
    description: string;
    images: string[];
    categoryId: string | null;
    materialType: string | null;
    estimatedProductionDays: number | null;
    options: ParsedOption[];
    variantCount: number;
  };
};

export type PreviewRowInvalid = {
  rowIndex: number;
  errors: string[];
  raw: CsvRow;
};

export type PreviewResult = {
  validRows: PreviewRowValid[];
  invalidRows: PreviewRowInvalid[];
  summary: { total: number; valid: number; invalid: number };
};

function safeFileName(name: string): string | null {
  const sanitised = name.replace(/[^a-zA-Z0-9-.]/g, "");
  if (sanitised.length === 0) return null;
  if (!sanitised.endsWith(".csv")) return null;
  return sanitised;
}

function uploadsImportsPath(fileName: string): string {
  return path.join(process.cwd(), "public", "uploads", "imports", fileName);
}

// ---------------------------------------------------------------------------
// previewCsv
// ---------------------------------------------------------------------------

export async function previewCsv(
  fileName: string,
): Promise<{ ok: true; result: PreviewResult } | { ok: false; error: string }> {
  await requireAdmin();
  const safeName = safeFileName(fileName);
  if (!safeName) return { ok: false, error: "Invalid file name" };

  let rows: CsvRow[];
  try {
    rows = await parseCsvStream(uploadsImportsPath(safeName));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Parse failed" };
  }

  const existingSlugRows = await db.select({ slug: products.slug }).from(products);
  const existingSlugs = new Set(existingSlugRows.map((r) => r.slug));

  const categoryRows = await db.select().from(categories);
  const categoriesByName = new Map(
    categoryRows.map((c) => [c.name.toLowerCase(), c.id]),
  );

  const csvSlugs = new Set<string>();
  const validRows: PreviewRowValid[] = [];
  const invalidRows: PreviewRowInvalid[] = [];

  rows.forEach((raw, i) => {
    const { row, images, errors: rowErrors } = normalizeCsvRow(raw);
    const errors: string[] = [...rowErrors];

    const zodParse = bulkImportRowSchema.safeParse(row);
    if (!zodParse.success) {
      for (const iss of zodParse.error.issues) {
        errors.push(`${iss.path.join(".") || "row"}: ${iss.message}`);
      }
    }

    const name = row.name ?? "";
    const slug = (row.slug?.trim() || slugifyForImport(name)).trim();
    if (!slug) errors.push("slug: cannot derive from name");
    if (slug && existingSlugs.has(slug)) {
      errors.push(`slug: "${slug}" already exists in DB`);
    }
    if (slug && csvSlugs.has(slug)) {
      errors.push(`slug: "${slug}" appears more than once in this CSV`);
    }
    if (slug) csvSlugs.add(slug);

    let categoryId: string | null = null;
    if (row.category_name) {
      const found = categoriesByName.get(row.category_name.toLowerCase());
      if (!found) {
        errors.push(
          `category_name: "${row.category_name}" not found — create it first via /admin/categories`,
        );
      } else {
        categoryId = found;
      }
    }

    if (errors.length > 0 || !zodParse.success) {
      invalidRows.push({ rowIndex: i + 2, errors, raw });
      return;
    }

    const z = zodParse.data;
    const options = deriveOptions(z);
    const optErrors = validateOptions(options);
    if (optErrors.length > 0) {
      invalidRows.push({ rowIndex: i + 2, errors: optErrors, raw });
      return;
    }

    // Count cartesian variants
    const variantCount = options.reduce((acc, opt) => acc * opt.values.length, 1);

    validRows.push({
      rowIndex: i + 2,
      data: {
        name: z.name,
        slug,
        description: z.description,
        images,
        categoryId,
        materialType: z.material_type ?? null,
        estimatedProductionDays: z.estimated_production_days ?? null,
        options,
        variantCount,
      },
    });
  });

  return {
    ok: true,
    result: {
      validRows,
      invalidRows,
      summary: {
        total: rows.length,
        valid: validRows.length,
        invalid: invalidRows.length,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// commitCsvImport
// ---------------------------------------------------------------------------

export type CommitResult =
  | {
      ok: true;
      results: {
        successes: string[];
        failures: Array<{ row: number; error: string }>;
      };
    }
  | { ok: false; error: string };

export async function commitCsvImport(fileName: string): Promise<CommitResult> {
  await requireAdmin();
  const safeName = safeFileName(fileName);
  if (!safeName) return { ok: false, error: "Invalid file name" };

  const prev = await previewCsv(safeName);
  if (!prev.ok) return prev;

  const successes: string[] = [];
  const failures: Array<{ row: number; error: string }> = [];

  try {
    await db.transaction(async (tx) => {
      for (const v of prev.result.validRows) {
        const productId = randomUUID();
        try {
          await tx.insert(products).values({
            id: productId,
            name: v.data.name,
            slug: v.data.slug,
            description: v.data.description,
            images: v.data.images,
            materialType: v.data.materialType,
            estimatedProductionDays: v.data.estimatedProductionDays,
            categoryId: v.data.categoryId,
            isActive: true,
            isFeatured: false,
          });

          // Insert options and values, then build cartesian variant matrix
          // optionSlots[i] = array of { optionValueId, pricePart } for option slot i
          type ValueSlot = { optionValueId: string; pricePart: string | null };
          const optionSlots: ValueSlot[][] = [];

          for (let optIdx = 0; optIdx < v.data.options.length; optIdx++) {
            const opt = v.data.options[optIdx];
            const optionId = randomUUID();
            await tx.insert(productOptions).values({
              id: optionId,
              productId,
              name: opt.name,
              position: optIdx + 1,
            });

            const slotValues: ValueSlot[] = [];
            for (let valIdx = 0; valIdx < opt.values.length; valIdx++) {
              const valueId = randomUUID();
              await tx.insert(productOptionValues).values({
                id: valueId,
                optionId,
                value: opt.values[valIdx],
                position: valIdx + 1,
              });
              slotValues.push({
                optionValueId: valueId,
                pricePart: opt.prices[valIdx] ?? null,
              });
            }
            optionSlots.push(slotValues);
          }

          // Build cartesian product of all option slots
          // Each combo is an array of ValueSlot (one per option)
          type Combo = ValueSlot[];
          let combos: Combo[] = [[]];
          for (const slot of optionSlots) {
            const next: Combo[] = [];
            for (const existing of combos) {
              for (const val of slot) {
                next.push([...existing, val]);
              }
            }
            combos = next;
          }

          // Insert variants — price comes from the first option slot's pricePart
          // (subsequent option slots' prices are ignored in this version; the
          // admin can fine-tune via the variant editor).
          const variantInserts = combos.map((combo, idx) => {
            const price = combo.find((c) => c.pricePart !== null)?.pricePart ?? "0.00";
            const [s1, s2, s3] = combo;
            return {
              id: randomUUID(),
              productId,
              price,
              position: idx + 1,
              inStock: true,
              option1ValueId: s1?.optionValueId ?? null,
              option2ValueId: s2?.optionValueId ?? null,
              option3ValueId: s3?.optionValueId ?? null,
            };
          });

          if (variantInserts.length > 0) {
            await tx.insert(productVariants).values(variantInserts);
          }

          successes.push(v.data.slug);
        } catch (err) {
          failures.push({
            row: v.rowIndex,
            error: err instanceof Error ? err.message : "Insert failed",
          });
          throw err; // rollback the entire transaction
        }
      }
    });
  } catch {
    return { ok: true, results: { successes: [], failures } };
  }

  try {
    await unlink(uploadsImportsPath(safeName));
  } catch {
    // file may already be missing; ignore
  }

  revalidatePath("/admin/products");
  return { ok: true, results: { successes, failures } };
}
