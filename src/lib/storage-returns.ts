import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * 260601-afs — Return photo storage helper.
 *
 * Stores individual review photos for return requests under:
 *   public/uploads/returns/<orderId>/<uuid>.<ext>
 *
 * Unlike product images this is a simple single-file store (no pipeline resize
 * needed — these are evidence photos, not storefront assets). Max 50 MB,
 * allowed MIME types match the product pipeline.
 *
 * Path traversal is prevented by validating the orderId component:
 * sanitised to alphanumeric + dash only, matching the existing safeBucket()
 * pattern in storage.ts.
 */

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB pre-compress cap
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function safeOrderId(input: string): string {
  const sanitized = input.replace(/[^a-zA-Z0-9-]/g, "");
  return sanitized.length > 0 ? sanitized : "unknown";
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return map[mime] ?? "bin";
}

/**
 * Persist a return review photo for the given orderId.
 * Returns the public path string (e.g. /uploads/returns/<orderId>/<uuid>.jpg).
 * Throws on size/type violation or filesystem error.
 */
export async function writeReturnPhoto(
  orderId: string,
  file: File,
): Promise<string> {
  if (file.type && !ALLOWED_MIMES.has(file.type)) {
    throw new Error(
      "Unsupported image type (allowed: JPEG, PNG, WebP, HEIC/HEIF)",
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large (max 50 MB)");
  }

  const safeId = safeOrderId(orderId);
  const uuid = crypto.randomUUID();
  const ext = extFromMime(file.type ?? "image/jpeg");
  const filename = `${uuid}.${ext}`;

  const dir = path.join(process.cwd(), UPLOADS_DIR, "returns", safeId);
  const fullPath = path.join(dir, filename);

  // Path-traversal guard
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(fullPath).startsWith(root)) {
    throw new Error("Invalid upload path");
  }

  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buf);

  return `${PUBLIC_PREFIX}/returns/${safeId}/${filename}`;
}
