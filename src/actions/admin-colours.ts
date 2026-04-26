"use server";

import { db } from "@/lib/db";
import {
  colors,
  productOptionValues,
  productOptions,
  products,
  productVariants,
} from "@/lib/db/schema";
import { eq, desc, asc, and, inArray, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { colourSchema } from "@/lib/validators";
import type { ColourAdmin } from "@/lib/colours";

// ============================================================================
// Plan 18-03 admin colour CRUD.
//
// IMPORTANT (T-18-03-admin-bypass):
//   requireAdmin() FIRST await in every export — middleware-only checks are
//   bypassable per CVE-2025-29927 (CLAUDE.md).
//
// IMPORTANT (T-18-03-input-injection):
//   All FormData inputs flow through colourSchema.safeParse(). First Zod issue
//   is surfaced as user-facing error.
//
// NOTE (deferred to Plan 18-04):
//   `deleteColour` (with IN_USE guard) and `renameColour` (cascade-rename
//   transaction) are NOT exported here. They land alongside the cascade
//   infrastructure in 18-04.
// ============================================================================

export type MutateResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }
  | {
      ok: false;
      code: "IN_USE";
      error: string;
      products: { id: string; name: string; slug: string }[];
    };

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listColours(): Promise<ColourAdmin[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(colors)
    .orderBy(desc(colors.isActive), asc(colors.brand), asc(colors.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    hex: r.hex,
    previousHex: r.previousHex ?? null,
    brand: r.brand,
    code: r.code ?? null,
    familyType: r.familyType,
    familySubtype: r.familySubtype,
    isActive: r.isActive,
  }));
}

export async function getColour(id: string): Promise<ColourAdmin | null> {
  await requireAdmin();
  const [r] = await db.select().from(colors).where(eq(colors.id, id)).limit(1);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    hex: r.hex,
    previousHex: r.previousHex ?? null,
    brand: r.brand,
    code: r.code ?? null,
    familyType: r.familyType,
    familySubtype: r.familySubtype,
    isActive: r.isActive,
  };
}

// ---------------------------------------------------------------------------
// Form parsing helper (mirrors parseCouponForm in admin-coupons.ts)
// ---------------------------------------------------------------------------

function parseColourForm(formData: FormData) {
  const previousHexRaw = String(formData.get("previousHex") ?? "").trim();
  const codeRaw = String(formData.get("code") ?? "").trim();
  const familySubtypeRaw = String(formData.get("familySubtype") ?? "").trim();
  const isActiveRaw = formData.get("isActive");
  return colourSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    hex: String(formData.get("hex") ?? "").trim(),
    previousHex: previousHexRaw === "" ? null : previousHexRaw,
    brand: String(formData.get("brand") ?? ""),
    familyType: String(formData.get("familyType") ?? ""),
    familySubtype: familySubtypeRaw === "" ? null : familySubtypeRaw,
    code: codeRaw === "" ? null : codeRaw,
    // checkbox: present (=on/true) when checked, absent when not
    isActive: isActiveRaw === "on" || isActiveRaw === "true",
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createColour(
  formData: FormData,
): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseColourForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;
  const id = randomUUID();
  try {
    await db.insert(colors).values({
      id,
      name: data.name,
      hex: data.hex.toUpperCase(),
      previousHex: data.previousHex ? data.previousHex.toUpperCase() : null,
      brand: data.brand,
      code: data.code ?? null,
      familyType: data.familyType,
      familySubtype: data.familySubtype ?? "",
      isActive: data.isActive ?? true,
    });
  } catch (err: unknown) {
    const raw = String((err as Error)?.message ?? "");
    if (raw.includes("ER_DUP_ENTRY") || raw.includes("Duplicate entry")) {
      return {
        ok: false,
        error: "A colour with this brand + code already exists.",
      };
    }
    console.error("[admin-colours] createColour failed:", err);
    return { ok: false, error: "Unable to create colour." };
  }
  revalidatePath("/admin/colours");
  revalidatePath("/shop");
  return { ok: true, id };
}

export async function updateColour(
  id: string,
  formData: FormData,
): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseColourForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;
  // NOTE: name + hex changes that affect linked product_option_values rows
  // are handled by `renameColour` in Plan 18-04 (cascade transaction).
  // For Wave 2 we update fields directly here; cascade lands in 18-04.
  try {
    await db
      .update(colors)
      .set({
        name: data.name,
        hex: data.hex.toUpperCase(),
        previousHex: data.previousHex ? data.previousHex.toUpperCase() : null,
        brand: data.brand,
        code: data.code ?? null,
        familyType: data.familyType,
        familySubtype: data.familySubtype ?? "",
        isActive: data.isActive ?? true,
      })
      .where(eq(colors.id, id));
  } catch (err: unknown) {
    const raw = String((err as Error)?.message ?? "");
    if (raw.includes("ER_DUP_ENTRY") || raw.includes("Duplicate entry")) {
      return {
        ok: false,
        error: "Another colour already uses this brand + code.",
      };
    }
    console.error("[admin-colours] updateColour failed:", err);
    return { ok: false, error: "Unable to update colour." };
  }
  revalidatePath("/admin/colours");
  revalidatePath(`/admin/colours/${id}/edit`);
  revalidatePath("/shop");
  return { ok: true, id };
}

export async function archiveColour(id: string): Promise<MutateResult> {
  await requireAdmin();
  await db.update(colors).set({ isActive: false }).where(eq(colors.id, id));
  revalidatePath("/admin/colours");
  revalidatePath("/shop");
  return { ok: true, id };
}

export async function reactivateColour(id: string): Promise<MutateResult> {
  await requireAdmin();
  await db.update(colors).set({ isActive: true }).where(eq(colors.id, id));
  revalidatePath("/admin/colours");
  revalidatePath("/shop");
  return { ok: true, id };
}

// ============================================================================
// Plan 18-04 — hard-delete (with IN_USE guard) + cascade rename mechanics.
//
// New exports below extend the Wave-2 admin module with the trickiest two
// flows from REQ-4 (in-use deletion guard) and D-09/D-10/D-11/D-12
// (denormalized cache + diff-aware cascade UPDATE in a single transaction).
//
// Manual hydration is used everywhere (CLAUDE.md MariaDB no-LATERAL rule).
// requireAdmin() FIRST await on every export (CVE-2025-29927).
// ============================================================================

// ---------------------------------------------------------------------------
// In-use guard helper — used by deleteColour and by the row-actions UI to
// render the IN_USE error modal listing every affected product.
//
// Manual multi-query hydration (no LATERAL):
//   1. SELECT pov.id, pov.option_id  WHERE color_id = :colorId
//   2. SELECT po.id, po.product_id   WHERE id IN (povOptionIds)
//   3. SELECT p.id, p.name, p.slug   WHERE id IN (productIds)
// ---------------------------------------------------------------------------

export async function getProductsUsingColour(
  colourId: string,
): Promise<{ id: string; name: string; slug: string }[]> {
  await requireAdmin();

  // 1. Find pov rows referencing this colour
  const povRows = await db
    .select({
      id: productOptionValues.id,
      optionId: productOptionValues.optionId,
    })
    .from(productOptionValues)
    .where(eq(productOptionValues.colorId, colourId));
  if (povRows.length === 0) return [];

  // 2. Hop pov → option → product (manual hydration)
  const optionIds = Array.from(new Set(povRows.map((r) => r.optionId)));
  const optRows = await db
    .select({
      id: productOptions.id,
      productId: productOptions.productId,
    })
    .from(productOptions)
    .where(inArray(productOptions.id, optionIds));
  const productIds = Array.from(new Set(optRows.map((r) => r.productId)));
  if (productIds.length === 0) return [];

  // 3. Resolve product display rows (name + slug for "Open" link in modal)
  const prodRows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
    })
    .from(products)
    .where(inArray(products.id, productIds));

  // Stable sort by name for predictable modal ordering
  return prodRows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Hard delete with IN_USE guard (REQ-4 / SPEC §4).
//
// Returns:
//   { ok: true, id }                                   — deleted (no references)
//   { ok: false, code: "IN_USE", error, products }     — blocked, products listed
//   { ok: false, error }                               — generic failure
// ---------------------------------------------------------------------------

export async function deleteColour(id: string): Promise<MutateResult> {
  await requireAdmin();

  const using = await getProductsUsingColour(id);
  if (using.length > 0) {
    return {
      ok: false,
      code: "IN_USE",
      error: `Cannot delete — colour is in use by ${using.length} product${using.length === 1 ? "" : "s"}.`,
      products: using,
    };
  }

  // No references — DB-level FK ON DELETE RESTRICT is defense-in-depth
  try {
    await db.delete(colors).where(eq(colors.id, id));
  } catch (err: unknown) {
    const raw = String((err as Error)?.message ?? "");
    if (
      raw.includes("foreign key constraint") ||
      raw.includes("ER_ROW_IS_REFERENCED")
    ) {
      // Race condition — a pov row was added between our check and delete
      const refresh = await getProductsUsingColour(id);
      return {
        ok: false,
        code: "IN_USE",
        error:
          "A product started using this colour while you were deleting. Please archive instead.",
        products: refresh,
      };
    }
    console.error("[admin-colours] deleteColour failed:", err);
    return { ok: false, error: "Unable to delete colour." };
  }

  revalidatePath("/admin/colours");
  revalidatePath("/shop");
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Cascade rename — diff-aware, single transaction (D-09 / D-10 / D-11 / D-12).
//
// Sequence:
//   1. Read pre-rename name/hex from colors row (anchor for diff-aware WHERE).
//   2. Pre-count rows that WOULD cascade (D-12 1000-row guardrail).
//   3. db.transaction:
//      a. UPDATE colors row (name + hex).
//      b. Diff-aware UPDATE pov: WHERE color_id = :id AND value = :pre.name
//         — manually-renamed pov rows are skipped (D-11 manual wins).
//      c. NULL labelCache on every variant whose option1..option6 references
//         any pov row linked to this colour (mirror renameOptionValue pattern).
//   4. revalidatePath /admin/colours, /shop, /.
// ---------------------------------------------------------------------------

export async function renameColour(
  id: string,
  input: { name?: string; hex?: string },
): Promise<MutateResult> {
  await requireAdmin();

  const [pre] = await db
    .select()
    .from(colors)
    .where(eq(colors.id, id))
    .limit(1);
  if (!pre) return { ok: false, error: "Colour not found." };

  const newName = input.name?.trim() ?? pre.name;
  const newHex = input.hex?.trim().toUpperCase() ?? pre.hex;

  const nameChanged = newName !== pre.name;
  const hexChanged = newHex !== pre.hex;
  if (!nameChanged && !hexChanged) return { ok: true, id };

  // Diff-aware count — only rows whose current value still matches the
  // pre-rename library snapshot will cascade. Manual edits are preserved.
  const [countRow] = await db
    .select({ c: count() })
    .from(productOptionValues)
    .where(
      and(
        eq(productOptionValues.colorId, id),
        eq(productOptionValues.value, pre.name),
      ),
    );
  const linkedCount = Number(countRow?.c ?? 0);

  if (linkedCount > 1000) {
    return {
      ok: false,
      error: `Cascade affects ${linkedCount} variant rows (>1000). Split the rename into smaller steps or contact engineering.`,
    };
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Update the colors row itself
      await tx
        .update(colors)
        .set({ name: newName, hex: newHex })
        .where(eq(colors.id, id));

      // 2. Diff-aware cascade — single UPDATE; manual-edit wins per D-11
      await tx
        .update(productOptionValues)
        .set({ value: newName, swatchHex: newHex })
        .where(
          and(
            eq(productOptionValues.colorId, id),
            eq(productOptionValues.value, pre.name),
          ),
        );

      // 3. Invalidate labelCache on every variant referencing the affected
      //    pov rows (mirror renameOptionValue at variants.ts:262-316 — null
      //    cache across all 6 positional option slots).
      const affectedPovs = await tx
        .select({ id: productOptionValues.id })
        .from(productOptionValues)
        .where(eq(productOptionValues.colorId, id));
      if (affectedPovs.length > 0) {
        const povIds = affectedPovs.map((r) => r.id);
        await Promise.all([
          tx
            .update(productVariants)
            .set({ labelCache: null })
            .where(inArray(productVariants.option1ValueId, povIds)),
          tx
            .update(productVariants)
            .set({ labelCache: null })
            .where(inArray(productVariants.option2ValueId, povIds)),
          tx
            .update(productVariants)
            .set({ labelCache: null })
            .where(inArray(productVariants.option3ValueId, povIds)),
          tx
            .update(productVariants)
            .set({ labelCache: null })
            .where(inArray(productVariants.option4ValueId, povIds)),
          tx
            .update(productVariants)
            .set({ labelCache: null })
            .where(inArray(productVariants.option5ValueId, povIds)),
          tx
            .update(productVariants)
            .set({ labelCache: null })
            .where(inArray(productVariants.option6ValueId, povIds)),
        ]);
      }
    });
  } catch (err: unknown) {
    const raw = String((err as Error)?.message ?? "");
    if (raw.includes("ER_DUP_ENTRY") || raw.includes("Duplicate entry")) {
      return {
        ok: false,
        error:
          "Cascade rename hit a duplicate value on a product. Resolve the conflict on that product first, then retry.",
      };
    }
    console.error("[admin-colours] renameColour failed:", err);
    return { ok: false, error: "Unable to rename colour." };
  }

  // Broad revalidation — colour names appear on /shop chips, every PDP, and
  // the admin colours surface. Narrow if perf becomes an issue.
  revalidatePath("/admin/colours");
  revalidatePath(`/admin/colours/${id}/edit`);
  revalidatePath("/shop");
  revalidatePath("/");

  return { ok: true, id };
}
