import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { compressUploadedImage } from "@/lib/image-pipeline";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";
// Pre-compress cap: 50 MB. The image pipeline downscales+re-encodes so the
// on-disk footprint is still small regardless of input size.
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

function safeBucket(input: string): string {
  // Bucket must be "new" or a UUID — anything else we sanitize to alphanum+dash
  // to prevent path traversal (T-04-06).
  if (input === "new") return "new";
  const sanitized = input.replace(/[^a-zA-Z0-9-]/g, "");
  return sanitized.length > 0 ? sanitized : "new";
}

/**
 * Phase 7 (07-08) — writeUpload now delegates to the sharp pipeline.
 *
 * Returns a "base URL" pointing at a directory rather than a single file.
 * The directory contains:
 *   orig.<ext>          backup
 *   400w.{webp,avif,jpg}
 *   800w.{webp,avif,jpg}
 *   1600w.{webp,avif,jpg}
 *   manifest.json       enumerates widths + filenames
 *
 * The storefront <picture> shell calls pickImage(baseUrl) -> reads
 * manifest.json -> emits srcset.
 *
 * Mime sniffing happens inside compressUploadedImage via magic bytes
 * (T-07-08-mime-spoof: ignores multipart Content-Type header).
 */
export async function writeUpload(bucket: string, file: File): Promise<string> {
  if (file.type && !ALLOWED_MIMES.has(file.type)) {
    // Defense-in-depth check on the multipart Content-Type. Sniffing in
    // the pipeline is the source of truth.
    throw new Error(
      "Unsupported image type (allowed: JPEG, PNG, WebP, GIF)",
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large (max 50 MB)");
  }
  const safe = safeBucket(bucket);
  const id = crypto.randomUUID();
  const baseDir = path.join(
    process.cwd(),
    UPLOADS_DIR,
    "products",
    safe,
    id,
  );
  // Double-check path stays inside UPLOADS_DIR.
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(baseDir).startsWith(root)) {
    throw new Error("Invalid upload path");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  await compressUploadedImage(buf, baseDir);
  // Return base URL — no extension. pickImage(baseUrl) reads manifest.json.
  return `${PUBLIC_PREFIX}/products/${safe}/${id}`;
}

export async function deleteUpload(publicUrl: string): Promise<void> {
  if (!publicUrl.startsWith(PUBLIC_PREFIX + "/")) return;
  const rel = publicUrl.slice(PUBLIC_PREFIX.length + 1);
  const abs = path.join(process.cwd(), UPLOADS_DIR, rel);
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  // Path-traversal guard (T-04-06).
  if (!path.resolve(abs).startsWith(root)) return;
  try {
    // Phase 7 (07-08): Two shapes possible.
    //   - Legacy file: unlink one file.
    //   - New base URL: rm -rf the directory of variants.
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) return;
    if (stat.isDirectory()) {
      await fs.rm(abs, { recursive: true, force: true });
    } else {
      await fs.unlink(abs);
    }
  } catch {
    // Swallow — the file may already be gone, or the path may be on a
    // different filesystem. Product references are cleaned separately.
  }
}

export function publicUrlFor(bucket: string, filename: string): string {
  return `${PUBLIC_PREFIX}/products/${safeBucket(bucket)}/${filename}`;
}

/**
 * Called by createProduct after the product UUID is known.
 *
 * During "new product" creation the ImageUploader uploads images with
 * bucket="new", landing at  /uploads/products/new/<temp-uuid>/.
 * Once the product ID is generated we must:
 *   1. Move each /new/<temp-uuid>/ directory to /<productId>/<temp-uuid>/
 *   2. Rewrite the URL from /uploads/products/new/<uuid> to
 *      /uploads/products/<productId>/<uuid>
 *
 * Only URLs that start with ${PUBLIC_PREFIX}/products/new/ are touched.
 * URLs already pointing at a productId bucket are returned as-is (idempotent).
 *
 * Returns the rewritten URL array. On per-image move errors the original URL
 * is kept (so the DB is never silently corrupted) and the error is logged.
 */
export async function migrateNewImages(
  productId: string,
  urls: string[],
): Promise<string[]> {
  const safePid = safeBucket(productId);
  const newPrefix = `${PUBLIC_PREFIX}/products/new/`;

  const result: string[] = [];
  for (const url of urls) {
    if (!url.startsWith(newPrefix)) {
      // Already using the correct bucket or some other URL — leave it.
      result.push(url);
      continue;
    }

    // Extract the temp UUID portion after /new/
    const tempUuid = url.slice(newPrefix.length).split("/")[0];
    if (!tempUuid) {
      result.push(url);
      continue;
    }

    const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
    const srcDir = path.join(process.cwd(), UPLOADS_DIR, "products", "new", tempUuid);
    const destDir = path.join(process.cwd(), UPLOADS_DIR, "products", safePid, tempUuid);

    // Traversal guard.
    if (
      !path.resolve(srcDir).startsWith(root) ||
      !path.resolve(destDir).startsWith(root)
    ) {
      result.push(url);
      continue;
    }

    try {
      const stat = await fs.stat(srcDir).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        // Source dir missing — keep the original URL so the caller can decide
        // what to do; do not silently drop the entry.
        console.warn(`[migrateNewImages] source dir missing: ${srcDir}`);
        result.push(url);
        continue;
      }
      // Ensure destination parent exists.
      await fs.mkdir(path.dirname(destDir), { recursive: true });
      await fs.rename(srcDir, destDir);
      // Rewrite URL: replace /new/<uuid> with /<productId>/<uuid>
      result.push(`${PUBLIC_PREFIX}/products/${safePid}/${tempUuid}`);
    } catch (err) {
      console.error(`[migrateNewImages] failed to move ${srcDir} → ${destDir}:`, err);
      // Keep original URL so the admin can see the image is not yet migrated.
      result.push(url);
    }
  }
  return result;
}
