/**
 * One-shot repair for the "Keyboard Name Clicker" product
 * (slug: keyboard-name-clicker-3-letters-mo9gqwv8,
 *  id:   99bf7aef-6c91-45bc-acb8-cc5a00d57b2a — the slug-renamed Waffle product).
 *
 * Symptom (reported 2026-05-01):
 *   User says only 2 of N gallery images load on the PDP.
 *
 * Root cause (after on-prod investigation):
 *   - 9 image dirs exist on disk under public/uploads/products/<id>/, all
 *     healthy (manifest.json + orig.* + variants present). All return 200.
 *   - DB products.images only references 1 of them (53833dba). The rest of
 *     the references (6 dirs) live on product_variants.image_url for the 6
 *     waffle variants, so they only render as variant thumbnails — never
 *     as standalone gallery images.
 *   - Two further dirs (71126358, 7b512c63) are byte-for-byte duplicates of
 *     53833dba and 12e00fca respectively (md5 match) — orphan re-uploads
 *     created during earlier debug attempts. Skip them.
 *
 *   The previous repair-prod-images.ts (run on prod 2026-05-01 07:31) did
 *   not drop URLs from this product — products.images was already at 1
 *   when it ran. The gallery has therefore been showing 1 image since the
 *   original /new/-bucket cleanup wiped the multi-image gallery URLs.
 *
 * Fix:
 *   Repopulate products.images with the 1 existing main image + the 6
 *   unique variant-aligned images so the PDP gallery renders all 7
 *   distinct waffle photos. Variants keep their image_url FK refs
 *   (no change to product_variants).
 *
 * Idempotent:
 *   The script reads the current images[] and short-circuits if all 7
 *   target URLs are already present. Safe to re-run.
 *
 * Run on prod (CWD = app root):
 *   dotenv -e .env.local -- npx tsx scripts/repair-keyboard-name-clicker.ts
 */

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, pool } from "../src/lib/db";
import { products, productVariants } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

const PRODUCT_ID = "99bf7aef-6c91-45bc-acb8-cc5a00d57b2a";
const SLUG = "keyboard-name-clicker-3-letters-mo9gqwv8";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";

type ImageEntry = {
  url: string;
  caption?: string | null;
  alt?: string | null;
};

function uploadsRoot(): string {
  return path.resolve(path.join(process.cwd(), UPLOADS_DIR));
}

function publicUrl(productId: string, imageUuid: string): string {
  return `${PUBLIC_PREFIX}/products/${productId}/${imageUuid}`;
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

async function imageDirHealthy(productId: string, imageUuid: string): Promise<boolean> {
  const dir = path.join(uploadsRoot(), "products", productId, imageUuid);
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return false;
    await fs.access(path.join(dir, "manifest.json"));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("=== repair-keyboard-name-clicker ===");
  console.log(`UPLOADS_DIR=${UPLOADS_DIR}`);
  console.log(`product=${PRODUCT_ID} (slug=${SLUG})\n`);

  // Load product row.
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
  for (const e of current) console.log(`  - ${e.url}`);

  // Fetch the variant rows so we know which on-disk dirs map to which variant.
  const variantRows = await db
    .select({
      id: productVariants.id,
      imageUrl: productVariants.imageUrl,
      label: productVariants.labelCache,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, PRODUCT_ID));

  console.log(`\nVariants with images: ${variantRows.filter((v) => v.imageUrl).length}`);
  for (const v of variantRows) {
    console.log(`  - ${v.id}  ${v.label ?? ""} -> ${v.imageUrl ?? "(no image)"}`);
  }

  // Build target gallery list:
  //   1. Keep whatever already lives in products.images (preserves caption/alt).
  //   2. Append every variant image_url (deduped) whose dir is healthy on disk
  //      and is not already present.
  const targetByUrl = new Map<string, ImageEntry>();
  for (const e of current) {
    if (e.url) targetByUrl.set(e.url, e);
  }

  for (const v of variantRows) {
    if (!v.imageUrl) continue;
    if (targetByUrl.has(v.imageUrl)) continue;

    // Strip /uploads/products/<pid>/ prefix to get the imageUuid.
    const expectedPrefix = `${PUBLIC_PREFIX}/products/${PRODUCT_ID}/`;
    if (!v.imageUrl.startsWith(expectedPrefix)) {
      console.log(`  SKIP (foreign URL): ${v.imageUrl}`);
      continue;
    }
    const imageUuid = v.imageUrl.slice(expectedPrefix.length).replace(/\/$/, "");
    const healthy = await imageDirHealthy(PRODUCT_ID, imageUuid);
    if (!healthy) {
      console.log(`  SKIP (dir not healthy): ${v.imageUrl}`);
      continue;
    }
    targetByUrl.set(v.imageUrl, {
      url: publicUrl(PRODUCT_ID, imageUuid),
      caption: v.label ?? null,
      alt: null,
    });
  }

  const target = Array.from(targetByUrl.values());

  console.log(`\nTarget products.images count: ${target.length}`);
  for (const e of target) console.log(`  - ${e.url}  caption="${e.caption ?? ""}"`);

  // Idempotency: short-circuit when nothing would change.
  const sameLength = target.length === current.length;
  const sameUrls =
    sameLength &&
    target.every((t, i) => t.url === current[i]?.url);
  if (sameLength && sameUrls) {
    console.log("\nNo change required — products.images already matches target.");
    await pool.end();
    process.exit(0);
  }

  // Apply update.
  await db
    .update(products)
    .set({ images: target })
    .where(eq(products.id, PRODUCT_ID));

  console.log(`\nUpdated products.images: ${current.length} -> ${target.length}`);

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Unexpected error:", err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
