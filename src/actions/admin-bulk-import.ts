"use server";

import { db } from "@/lib/db";
import { products, productVariants, categories } from "@/lib/db/schema";
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
// Plan 05-05 admin bulk product import (CSV).
//
// Threat mitigations:
//   - T-05-05-EoP: requireAdmin() FIRST in every export
//   - T-05-05-injection: parseCsvStream caps file size + row count + columns
//   - T-05-05-SSRF: normalizeCsvRow rejects external URLs
//   - T-05-05-path-traversal: fileName sanitised via regex; constrained to
//     public/uploads/imports/
//   - T-05-05-state: commit runs inside a single db.transaction; any failure
//     rolls everything back
// ============================================================================

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
    priceS: string | null;
    priceM: string | null;
    priceL: string | null;
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

  // Pre-load existing slugs for dedup
  const existingSlugRows = await db
    .select({ slug: products.slug })
    .from(products);
  const existingSlugs = new Set(existingSlugRows.map((r) => r.slug));

  // Pre-load categories so each row can resolve category_name → id
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
          `category_name: "${row.category_name}" not found — create the category first via /admin/categories`,
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
    validRows.push({
      rowIndex: i + 2, // +1 for 1-indexed, +1 for header row
      data: {
        name: z.name,
        slug,
        description: z.description,
        images,
        categoryId,
        materialType: z.material_type ?? null,
        estimatedProductionDays: z.estimated_production_days ?? null,
        priceS: z.price_s ?? null,
        priceM: z.price_m ?? null,
        priceL: z.price_l ?? null,
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

export type CommitResult = {
  ok: true;
  results: {
    successes: string[];
    failures: Array<{ row: number; error: string }>;
  };
} | { ok: false; error: string };

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

          const variants: Array<{
            id: string;
            productId: string;
            size: "S" | "M" | "L";
            price: string;
          }> = [];
          if (v.data.priceS)
            variants.push({
              id: randomUUID(),
              productId,
              size: "S",
              price: v.data.priceS,
            });
          if (v.data.priceM)
            variants.push({
              id: randomUUID(),
              productId,
              size: "M",
              price: v.data.priceM,
            });
          if (v.data.priceL)
            variants.push({
              id: randomUUID(),
              productId,
              size: "L",
              price: v.data.priceL,
            });
          if (variants.length > 0) {
            await tx.insert(productVariants).values(variants);
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
    // transaction already rolled back; failures array already captured
    // the offending row. Reset successes since nothing was committed.
    return {
      ok: true,
      results: { successes: [], failures },
    };
  }

  // Delete the temp CSV file after commit (whether success or rollback).
  try {
    await unlink(uploadsImportsPath(safeName));
  } catch {
    // file may already be missing; ignore
  }

  revalidatePath("/admin/products");
  return { ok: true, results: { successes, failures } };
}
