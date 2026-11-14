"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  commitImport,
  fileToGrid,
  previewImport,
} from "@/lib/product-cost-import";
import type {
  CostImportCommitResult,
  CostImportPreview,
} from "@/lib/product-cost-types";

// Bulk product-cost import (Accounting v2). Both actions re-read and re-validate
// the uploaded file on the server: nothing the browser says about the rows is
// trusted. The dry run is the commit code path rolled back, so the preview and
// the commit always agree. Commit is a single transaction and idempotent
// (re-uploading the same file changes nothing).

async function readUpload(
  formData: FormData,
): Promise<
  | { ok: true; grid: unknown[][]; backfill: boolean }
  | { ok: false; error: string }
> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  const bytes = await file.arrayBuffer();
  const read = await fileToGrid(file.name, bytes);
  if (!read.ok) return read;
  return { ok: true, grid: read.grid, backfill: formData.get("backfill") === "1" };
}

export async function previewCostImport(
  formData: FormData,
): Promise<CostImportPreview | { ok: false; error: string }> {
  await requireAdmin();
  const up = await readUpload(formData);
  if (!up.ok) return up;
  try {
    return await previewImport(up.grid, { backfill: up.backfill });
  } catch (err) {
    console.error("[product-cost-import] preview failed:", err);
    return { ok: false, error: "Could not check that file. Nothing was changed." };
  }
}

export async function commitCostImport(
  formData: FormData,
): Promise<CostImportCommitResult> {
  await requireAdmin();
  const up = await readUpload(formData);
  if (!up.ok) return up;
  try {
    const run = await commitImport(up.grid, { backfill: up.backfill });
    revalidatePath("/admin/products");
    revalidatePath("/admin/products/costs");
    revalidatePath("/admin/accounting");
    return {
      ok: true,
      updated: run.updated,
      unchanged: run.unchanged,
      skipped: run.skipped,
      errors: run.errors,
      changes: run.changes,
      backfill: run.backfill,
    };
  } catch (err) {
    console.error("[product-cost-import] commit failed:", err);
    return { ok: false, error: "The import failed and nothing was changed. Please try again." };
  }
}
