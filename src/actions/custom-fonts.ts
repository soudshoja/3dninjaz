"use server";

import "server-only";
import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { customFonts } from "@/lib/db/schema";
import type { CustomFont } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";

export type { CustomFont };

/**
 * List all custom fonts. Pass activeOnly=true to filter to is_active=true rows.
 * No admin guard — storefront needs active fonts to render @font-face rules.
 */
export async function listCustomFonts(activeOnly = false): Promise<CustomFont[]> {
  if (activeOnly) {
    return db.select().from(customFonts).where(eq(customFonts.isActive, true));
  }
  return db.select().from(customFonts);
}

/**
 * Minimal shape used by <FontFaceLoader> — no admin guard (called at layout render).
 */
export async function getActiveCustomFontsForLoader(): Promise<
  { familySlug: string; fileUrl: string; displayName: string }[]
> {
  const rows = await db
    .select({
      familySlug: customFonts.familySlug,
      fileUrl: customFonts.fileUrl,
      displayName: customFonts.displayName,
    })
    .from(customFonts)
    .where(eq(customFonts.isActive, true));
  return rows;
}

/**
 * Toggle a font's active status. Admin-guarded.
 */
export async function toggleCustomFontActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  await requireAdmin();
  await db
    .update(customFonts)
    .set({ isActive })
    .where(eq(customFonts.id, id));
}

/**
 * Delete a font row and best-effort remove the file from disk. Admin-guarded.
 */
export async function deleteCustomFont(id: string): Promise<void> {
  await requireAdmin();

  const [row] = await db
    .select({ fileUrl: customFonts.fileUrl })
    .from(customFonts)
    .where(eq(customFonts.id, id))
    .limit(1);

  await db.delete(customFonts).where(eq(customFonts.id, id));

  // Best-effort file removal — delete the directory containing the font file.
  if (row?.fileUrl) {
    try {
      const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
      const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";
      if (row.fileUrl.startsWith(PUBLIC_PREFIX + "/fonts/")) {
        const rel = row.fileUrl.slice(PUBLIC_PREFIX.length + 1);
        // rel = "fonts/<uuid>/<filename>" — remove the uuid directory
        const parts = rel.split("/");
        // parts[0]=fonts, parts[1]=<uuid>
        if (parts.length >= 2 && parts[0] === "fonts" && parts[1]) {
          const dirAbs = path.join(process.cwd(), UPLOADS_DIR, "fonts", parts[1]);
          const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
          if (path.resolve(dirAbs).startsWith(root)) {
            await fs.rm(dirAbs, { recursive: true, force: true });
          }
        }
      }
    } catch {
      // Swallow — file already gone or permission issue; DB row already deleted.
    }
  }
}
