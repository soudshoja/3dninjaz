/**
 * Phase 18 — colour library helpers.
 *
 * Two layers:
 * 1. Pure slug helpers (`slugifyColourBase`, `buildColourSlugMap`) — no DB.
 * 2. DB query helpers (`getColourPublic`, `getColourAdmin`) — admin/public split
 *    so customer surfaces never leak `code` / `previous_hex` / `family_*`.
 *
 * Slug derivation per D-14 — runtime only, NO `slug` column on `colors`.
 * Cross-brand collision handled at `buildColourSlugMap` time by appending
 * `-<brand>` suffix to ALL ids that share a base slug.
 *
 * Wave 2 will add CRUD/cascade helpers in `src/actions/admin-colours.ts`.
 */

import { db } from "@/lib/db";
import { colors } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// ----------------------------------------------------------------------------
// Pure helpers re-exported from colour-slug.ts
// ----------------------------------------------------------------------------
// These live in a sibling module so client components (e.g. colour-form.tsx)
// can import them without webpack pulling mysql2/Drizzle through this file.
// Re-exported here for backwards compatibility — existing server-side callers
// can keep importing from "@/lib/colours".
export { slugifyColourBase, buildColourSlugMap } from "@/lib/colour-slug";

// ----------------------------------------------------------------------------
// Public-vs-admin DB query split (REQ-7 — codes never customer-facing)
// ----------------------------------------------------------------------------

export type ColourPublic = {
  id: string;
  name: string;
  hex: string;
};

export type ColourAdmin = {
  id: string;
  name: string;
  hex: string;
  previousHex: string | null;
  brand: "Bambu" | "Polymaker" | "Other";
  code: string | null;
  familyType: "PLA" | "PETG" | "TPU" | "CF" | "Other";
  familySubtype: string;
  isActive: boolean;
};

/**
 * Customer-facing colour fetch. Returns ONLY id/name/hex.
 * NEVER returns code / previous_hex / family_*.
 * Filters to is_active = true so soft-archived colours are invisible.
 */
export async function getColourPublic(
  id: string,
): Promise<ColourPublic | null> {
  const [row] = await db
    .select({
      id: colors.id,
      name: colors.name,
      hex: colors.hex,
    })
    .from(colors)
    .where(and(eq(colors.id, id), eq(colors.isActive, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Admin-only colour fetch. Returns full row including codes, family, etc.
 * Caller MUST gate this behind `requireAdmin()` — this helper does NOT.
 */
export async function getColourAdmin(id: string): Promise<ColourAdmin | null> {
  const [row] = await db
    .select()
    .from(colors)
    .where(eq(colors.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    hex: row.hex,
    previousHex: row.previousHex ?? null,
    brand: row.brand,
    code: row.code ?? null,
    familyType: row.familyType,
    familySubtype: row.familySubtype,
    isActive: row.isActive,
  };
}
