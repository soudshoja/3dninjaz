"use server";

import { db } from "@/lib/db";
import { colors } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
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
  | { ok: false; error: string };

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
