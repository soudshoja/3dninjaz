import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { compressUploadedImage, type ImageManifest } from "@/lib/image-pipeline";
import type { Readable } from "node:stream";

/**
 * Canonical product-image persistence and resolution helpers.
 *
 * Every code path that writes a product image MUST go through
 * `persistProductImage`. Every code path that reads one MUST go through
 * `resolveProductImage` (or delegate to pickImage in image-manifest.ts which
 * is the low-level reader).
 *
 * URL contract (single canonical shape, forever):
 *   /uploads/products/<productId>/<imageUuid>
 *
 * The `new/` bucket was a transitional artefact from before client-side UUID
 * pre-generation. It is no longer created by any path in this codebase.
 */

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";
const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PersistResult = {
  /** Canonical URL to store in products.images: /uploads/products/<pid>/<iid> */
  url: string;
  /** The UUID assigned to this image (the final path segment) */
  imageUuid: string;
  /** The Sharp-derived manifest written to disk */
  manifest: ImageManifest;
};

export type PictureSource = {
  type: "image/avif" | "image/webp" | "image/jpeg";
  srcSet: string;
};

export type PictureData = {
  sources: PictureSource[];
  fallbackSrc: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeProductId(input: string): string {
  // Explicitly block "new" — the legacy temp bucket that caused the URL bug.
  if (input === "new") {
    throw new Error(
      'persistProductImage: productId "new" is not allowed. ' +
        "Generate a real UUID on the client before uploading.",
    );
  }
  // Strip any path-traversal characters; only alphanum + hyphen allowed.
  const sanitized = input.replace(/[^a-zA-Z0-9-]/g, "");
  if (sanitized.length === 0) {
    throw new Error(
      `persistProductImage: invalid productId "${input}" — must be a UUID`,
    );
  }
  return sanitized;
}

function uploadsRoot(): string {
  return path.resolve(path.join(process.cwd(), UPLOADS_DIR));
}

function imageDir(productId: string, imageUuid: string): string {
  return path.join(uploadsRoot(), "products", productId, imageUuid);
}

function publicUrl(productId: string, imageUuid: string): string {
  return `${PUBLIC_PREFIX}/products/${productId}/${imageUuid}`;
}

function isLegacyUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(url);
}

// ---------------------------------------------------------------------------
// persistProductImage
// ---------------------------------------------------------------------------

/**
 * Persist a single product image. Handles upload → Sharp encode → manifest.
 * Single canonical entry point for ALL image writes regardless of caller.
 *
 * Side effects:
 *   Writes original + Sharp-derived WebP/AVIF/JPEG variants + manifest.json to:
 *   <UPLOADS_DIR>/products/<productId>/<imageUuid>/
 *
 * @param opts.productId  MUST be the final product UUID. NEVER pass "new".
 * @param opts.source     Image data as Buffer or Node Readable stream.
 * @param opts.mimeType   Declared MIME; pipeline re-sniffs via magic bytes.
 * @returns { url, imageUuid, manifest } — url is the canonical DB-ready URL.
 */
export async function persistProductImage(opts: {
  productId: string;
  source: Buffer | Readable;
  originalFilename: string;
  mimeType: string;
  caption?: string | null;
  alt?: string | null;
}): Promise<PersistResult> {
  const safePid = safeProductId(opts.productId);

  if (opts.mimeType && !ALLOWED_MIMES.has(opts.mimeType)) {
    throw new Error(
      `Unsupported image type "${opts.mimeType}" (allowed: JPEG, PNG, WebP, GIF, HEIC, HEIF)`,
    );
  }

  // Materialise stream to Buffer when needed.
  let buf: Buffer;
  if (Buffer.isBuffer(opts.source)) {
    buf = opts.source;
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of opts.source) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buf = Buffer.concat(chunks);
  }

  if (buf.length > MAX_BYTES) {
    throw new Error("Image exceeds 50 MB cap");
  }

  const imageUuid = randomUUID();
  const baseDir = imageDir(safePid, imageUuid);

  // Path-traversal guard.
  const root = uploadsRoot();
  if (!path.resolve(baseDir).startsWith(root)) {
    throw new Error("Invalid upload path");
  }

  await fs.mkdir(baseDir, { recursive: true });

  const manifest = await compressUploadedImage(buf, baseDir);
  const url = publicUrl(safePid, imageUuid);

  return { url, imageUuid, manifest };
}

// ---------------------------------------------------------------------------
// resolveProductImage
// ---------------------------------------------------------------------------

/**
 * Resolve whatever URL format is stored in the DB into a PictureData struct
 * ready for the storefront <picture> shell.
 *
 * Handles:
 *   - Canonical /uploads/products/<productId>/<imageUuid>   → reads manifest.json
 *   - Legacy    /uploads/products/<bucket>/<file>.jpg etc   → plain <img> fallback
 *   - Stale     /uploads/products/new/<uuid>                → warning + null return
 *
 * Returns null when the image is definitively unavailable (stale /new/ URL,
 * manifest missing, directory unreadable). Callers should skip null entries
 * rather than render a broken image.
 */
export async function resolveProductImage(
  url: string,
): Promise<PictureData | null> {
  if (!url) return null;

  // Warn + skip stale /new/ URLs — these indicate a failed migration.
  if (url.includes("/uploads/products/new/")) {
    console.warn(
      `[resolveProductImage] stale /new/ URL detected — this product needs repair: ${url}`,
    );
    return null;
  }

  // Legacy file-extension URL → plain fallback.
  if (isLegacyUrl(url)) {
    return { sources: [], fallbackSrc: url };
  }

  // New canonical directory URL → read manifest.json.
  const rel = url.startsWith(PUBLIC_PREFIX + "/")
    ? url.slice(PUBLIC_PREFIX.length + 1)
    : url.replace(/^\//, "");
  const dir = path.join(uploadsRoot(), rel);

  try {
    const text = await fs.readFile(path.join(dir, "manifest.json"), "utf8");
    const m = JSON.parse(text) as ImageManifest;
    const baseUrlSlash = url.endsWith("/") ? url : url + "/";
    const srcSet = (key: "webp" | "avif" | "jpg") =>
      m.variants.map((v) => `${baseUrlSlash}${v[key]} ${v.width}w`).join(", ");
    const sources: PictureSource[] = [
      { type: "image/avif", srcSet: srcSet("avif") },
      { type: "image/webp", srcSet: srcSet("webp") },
      { type: "image/jpeg", srcSet: srcSet("jpg") },
    ];
    const fallbackVariant = m.variants[m.variants.length - 1];
    return {
      sources,
      fallbackSrc: `${baseUrlSlash}${fallbackVariant.jpg}`,
    };
  } catch (err) {
    console.error("[resolveProductImage] manifest read failed:", url, err);
    // Try best-effort jpg fallback.
    try {
      const entries = await fs.readdir(dir);
      const jpg = entries.find((f) => f.endsWith(".jpg"));
      if (jpg) {
        const baseUrlSlash = url.endsWith("/") ? url : url + "/";
        return { sources: [], fallbackSrc: `${baseUrlSlash}${jpg}` };
      }
    } catch {
      // Directory unreadable — genuine missing image.
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// repairImageDir
// ---------------------------------------------------------------------------

/**
 * Re-run the Sharp pipeline over an existing orig.* file in an image dir that
 * has files but no manifest.json (caused by a mid-encode crash).
 *
 * Safe to call multiple times — if manifest.json already exists, returns early.
 */
export async function repairImageDir(
  productId: string,
  imageUuid: string,
): Promise<{ repaired: boolean; reason: string }> {
  const safePid = safeProductId(productId);
  const baseDir = imageDir(safePid, imageUuid);

  // Already healthy.
  try {
    await fs.access(path.join(baseDir, "manifest.json"));
    return { repaired: false, reason: "manifest already exists" };
  } catch {
    // Fall through to repair.
  }

  // Find orig.* file.
  let origFile: string | null = null;
  try {
    const entries = await fs.readdir(baseDir);
    origFile = entries.find((f) => f.startsWith("orig.")) ?? null;
  } catch {
    return { repaired: false, reason: `directory not found: ${baseDir}` };
  }

  if (!origFile) {
    return { repaired: false, reason: "no orig.* file found — cannot re-encode" };
  }

  const origPath = path.join(baseDir, origFile);
  const buf = await fs.readFile(origPath);

  // Re-run pipeline with skipBackup to avoid re-writing orig.*
  await compressUploadedImage(buf, baseDir, { skipBackup: true });

  return { repaired: true, reason: `re-encoded from ${origFile}` };
}
