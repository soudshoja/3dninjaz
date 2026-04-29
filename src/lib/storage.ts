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
