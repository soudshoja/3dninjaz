/**
 * One-shot repair script for production image data issues.
 *
 * Repairs:
 *   1. Vending product d80248b0 — image dir daa32ee1 has orig.png but no
 *      manifest.json (Sharp encode was interrupted). Re-runs the pipeline
 *      to generate the missing manifest + variants.
 *
 *   2. Waffle product 99bf7aef — DB images[] contains 2 URLs whose directories
 *      don't exist on disk (cc0a0c7f, 481c755b). Removes those entries so the
 *      product shows only images that actually exist.
 *
 *   3. Sweeps all products for any remaining /uploads/products/new/ URLs and
 *      reports them (but does not auto-repair — operator review required).
 *
 * Run on prod:
 *   dotenv -e .env.local -- npx tsx scripts/repair-prod-images.ts
 *
 * Idempotent: safe to run multiple times.
 */

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, pool } from "../src/lib/db";
import { products } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { compressUploadedImage } from "../src/lib/image-pipeline";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";

function uploadsRoot() {
  return path.resolve(path.join(process.cwd(), UPLOADS_DIR));
}

// ── Repair helper (same logic as repairImageDir in product-images.ts) ────────

async function repairDir(
  productId: string,
  imageUuid: string,
): Promise<{ repaired: boolean; reason: string }> {
  const baseDir = path.join(uploadsRoot(), "products", productId, imageUuid);
  const manifestPath = path.join(baseDir, "manifest.json");

  // Already healthy.
  try {
    await fs.access(manifestPath);
    return { repaired: false, reason: "manifest already exists" };
  } catch {
    // fall through
  }

  // Find orig.*
  let entries: string[] = [];
  try {
    entries = await fs.readdir(baseDir);
  } catch {
    return { repaired: false, reason: `directory not found: ${baseDir}` };
  }

  const origFile = entries.find((f) => f.startsWith("orig."));
  if (!origFile) {
    return { repaired: false, reason: "no orig.* found — cannot re-encode" };
  }

  const buf = await fs.readFile(path.join(baseDir, origFile));
  await compressUploadedImage(buf, baseDir, { skipBackup: true });
  return { repaired: true, reason: `re-encoded from ${origFile}` };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type ImageEntry = { url: string; caption?: string | null; alt?: string | null };

function parseImages(raw: unknown): ImageEntry[] {
  if (!raw) return [];
  const str = typeof raw === "string" ? raw : JSON.stringify(raw);
  try {
    const parsed = JSON.parse(str);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e: unknown) => {
      if (typeof e === "string") return { url: e };
      return e as ImageEntry;
    });
  } catch {
    return [];
  }
}

async function dirExists(productId: string, imageUuid: string): Promise<boolean> {
  const dir = path.join(uploadsRoot(), "products", productId, imageUuid);
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function uuidFromUrl(url: string): string | null {
  // URL shape: /uploads/products/<productId>/<imageUuid>
  const parts = url.split("/");
  return parts[parts.length - 1] ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== repair-prod-images ===");
  console.log(`UPLOADS_DIR=${UPLOADS_DIR}\n`);

  // ── 1. Repair daa32ee1 dir for vending product ──────────────────────────
  const VENDING_ID = "d80248b0-5af1-442d-9ba9-9b6ba32e98a7";
  const BROKEN_IMAGE_UUID = "daa32ee1-f891-4e36-9dc9-b2af6521f591";

  console.log(`[1] Repairing vending/${BROKEN_IMAGE_UUID} …`);
  const repairResult = await repairDir(VENDING_ID, BROKEN_IMAGE_UUID);
  console.log(`    ${repairResult.repaired ? "REPAIRED" : "SKIPPED"}: ${repairResult.reason}`);

  // ── 2. Remove non-existent image entries from waffle product ─────────────
  const WAFFLE_ID = "99bf7aef-6c91-45bc-acb8-cc5a00d57b2a";
  console.log(`\n[2] Cleaning waffle product images …`);

  const [waffleRow] = await db
    .select({ id: products.id, images: products.images })
    .from(products)
    .where(eq(products.id, WAFFLE_ID))
    .limit(1);

  if (!waffleRow) {
    console.log(`    Waffle product not found — skipping.`);
  } else {
    const entries = parseImages(waffleRow.images);
    console.log(`    Current image count: ${entries.length}`);

    const surviving: ImageEntry[] = [];
    for (const entry of entries) {
      const uuid = uuidFromUrl(entry.url);
      if (!uuid) {
        console.log(`    DROP (no uuid): ${entry.url}`);
        continue;
      }
      const exists = await dirExists(WAFFLE_ID, uuid);
      if (exists) {
        surviving.push(entry);
        console.log(`    KEEP: ${entry.url}`);
      } else {
        console.log(`    DROP (dir missing): ${entry.url}`);
      }
    }

    if (surviving.length !== entries.length) {
      await db
        .update(products)
        .set({ images: surviving })
        .where(eq(products.id, WAFFLE_ID));
      console.log(`    Updated: ${entries.length} → ${surviving.length} images`);
    } else {
      console.log(`    No changes needed.`);
    }
  }

  // ── 3. Sweep all products for stale /new/ URLs ────────────────────────────
  console.log(`\n[3] Sweeping all products for stale /new/ URLs …`);
  const allProducts = await db.select({ id: products.id, name: products.name, images: products.images }).from(products);
  let staleCount = 0;
  for (const p of allProducts) {
    const entries = parseImages(p.images);
    const stale = entries.filter((e) => e.url.includes("/uploads/products/new/"));
    if (stale.length > 0) {
      staleCount++;
      console.log(`    STALE (${stale.length} urls): product ${p.id} (${p.name})`);
      for (const e of stale) console.log(`      ${e.url}`);
    }
  }
  if (staleCount === 0) {
    console.log("    No stale /new/ URLs found.");
  }

  console.log("\n=== repair complete ===");
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Unexpected error:", err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
