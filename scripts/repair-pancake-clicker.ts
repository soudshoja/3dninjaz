/**
 * One-shot repair / verification for the "Pancake Clicker" product
 * (slug: pancake-clicker-mogqlfp6,
 *  id:   b44d45a7-2120-4898-aac3-2cbac8240bdf — productType=keychain).
 *
 * Symptom (reported 2026-05-01):
 *   User says "last 3 of N images" don't render on the PDP.
 *
 * Root cause (after on-prod investigation 2026-05-01):
 *   None — products.images already lists all 7 images. All 7 image dirs
 *   exist on disk under public/uploads/products/<id>/, each with manifest.json
 *   + orig.png + 12 Sharp-derived variants (400/480/800/960 × webp/avif/jpg).
 *   All 7×12 = 84 variant URLs return HTTP 200 from the storefront. The PDP
 *   HTML renders 7 identical <picture> elements, byte-for-byte symmetric.
 *
 *   The user's perceived "broken last 3" is the gallery thumbstrip behaviour:
 *   the configurable-image-gallery (`ConfigurableImageGallery`) renders 8
 *   thumbs (1 "Yours" preview + 7 display images) inside an overflow-x-auto
 *   <ul>. On typical viewports only 4-5 thumbs are visible at once; the
 *   remaining thumbs are reachable via the right chevron / horizontal scroll.
 *   Lazy-loading (`loading="lazy"` on thumb <img>) defers their fetch until
 *   they enter the viewport, which can read as "missing" before the user
 *   scrolls.
 *
 *   No data repair is required. This script verifies that disposition is
 *   still true and is idempotent — running twice = same no-op.
 *
 * Idempotent:
 *   The script reads products.images, walks every URL, asserts the dir is
 *   healthy (manifest.json present), and either short-circuits (all OK) or
 *   reports / drops genuinely-missing entries. Safe to re-run.
 *
 * Run on prod (CWD = app root):
 *   NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" \
 *     dotenv -e .env.local -- npx tsx scripts/repair-pancake-clicker.ts
 */

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, pool } from "../src/lib/db";
import { products } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

const PRODUCT_ID = "b44d45a7-2120-4898-aac3-2cbac8240bdf";
const SLUG = "pancake-clicker-mogqlfp6";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";

type ImageEntry = {
  url: string;
  caption?: string | null;
  alt?: string | null;
};

type Disposition = "ok" | "manifest-missing" | "dir-missing" | "stale-new";

function uploadsRoot(): string {
  return path.resolve(path.join(process.cwd(), UPLOADS_DIR));
}

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

async function classify(url: string): Promise<{ disposition: Disposition; reason: string }> {
  if (url.includes("/uploads/products/new/")) {
    return { disposition: "stale-new", reason: "stale /new/ bucket URL" };
  }
  // Strip /uploads prefix to get rel path under uploadsRoot.
  const rel = url.startsWith(PUBLIC_PREFIX + "/")
    ? url.slice(PUBLIC_PREFIX.length + 1)
    : url.replace(/^\//, "");
  const dir = path.join(uploadsRoot(), rel);
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      return { disposition: "dir-missing", reason: `${dir} exists but is not a directory` };
    }
  } catch {
    return { disposition: "dir-missing", reason: `${dir} not found` };
  }
  try {
    await fs.access(path.join(dir, "manifest.json"));
    return { disposition: "ok", reason: "manifest.json present" };
  } catch {
    // Could potentially be re-encoded via repairImageDir, but flag separately.
    return { disposition: "manifest-missing", reason: "dir present but manifest.json missing" };
  }
}

async function main() {
  console.log("=== repair-pancake-clicker ===");
  console.log(`UPLOADS_DIR=${UPLOADS_DIR}`);
  console.log(`product=${PRODUCT_ID} (slug=${SLUG})\n`);

  const [row] = await db
    .select({ id: products.id, slug: products.slug, images: products.images })
    .from(products)
    .where(eq(products.id, PRODUCT_ID))
    .limit(1);

  if (!row) {
    console.error(`Product ${PRODUCT_ID} not found — aborting.`);
    process.exit(1);
  }

  if (row.slug !== SLUG) {
    console.warn(
      `WARN: product slug is "${row.slug}" — script was written for "${SLUG}". ` +
        "Continuing anyway since id matches.",
    );
  }

  const current = parseImages(row.images);
  console.log(`Current products.images count: ${current.length}`);

  // Walk every image and classify.
  const dispositions = await Promise.all(
    current.map(async (e) => ({ entry: e, ...(await classify(e.url)) })),
  );

  for (const d of dispositions) {
    console.log(`  [${d.disposition.padEnd(16)}] ${d.entry.url}  — ${d.reason}`);
  }

  const okCount = dispositions.filter((d) => d.disposition === "ok").length;
  const dropCount = dispositions.filter(
    (d) => d.disposition === "dir-missing" || d.disposition === "stale-new",
  ).length;
  const repairCount = dispositions.filter((d) => d.disposition === "manifest-missing").length;

  console.log(
    `\nSummary: ${okCount} ok, ${repairCount} need re-encode, ${dropCount} unrecoverable`,
  );

  // Idempotent short-circuit: nothing to do if all OK.
  if (dropCount === 0 && repairCount === 0) {
    console.log("\nNo change required — all images healthy.");
    await pool.end();
    process.exit(0);
  }

  // Build the surviving URL list, dropping unrecoverable entries.
  const surviving = dispositions
    .filter((d) => d.disposition === "ok" || d.disposition === "manifest-missing")
    .map((d) => d.entry);

  if (surviving.length === current.length) {
    console.log("\nNo URL drops needed (only re-encodes).");
  } else {
    console.log(
      `\nDropping ${current.length - surviving.length} unrecoverable URL(s) from products.images.`,
    );
    await db.update(products).set({ images: surviving }).where(eq(products.id, PRODUCT_ID));
    console.log(`Updated products.images: ${current.length} -> ${surviving.length}`);
  }

  if (repairCount > 0) {
    console.log(
      `\n${repairCount} dir(s) need manifest re-encode. Run repairImageDir() ` +
        `from src/lib/product-images.ts manually for each, or upload a fresh image.`,
    );
  }

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Unexpected error:", err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
