import "server-only";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Phase 20 (20-03) — payment proof storage.
 *
 * Stores customer/admin uploaded payment slips with optional thumbnail
 * generation for image files. EXIF stripped (PDPA safeguard — receipts
 * may carry GPS coordinates).
 * PDFs pass through unchanged with thumbnailUrl=null.
 *
 * Constraints:
 *   - Max 10 MB per file
 *   - MIME allowlist: image/jpeg, image/png, image/webp, image/heic,
 *     image/heif, application/pdf
 *   - Path: public/uploads/payment-proofs/<orderId>/<uuid>.<ext>
 *   - Thumbnail: <uuid>.thumb.webp (256px wide, contain, transparent bg)
 *
 * Sibling to src/lib/image-pipeline.ts per D-09.
 * Do NOT import from image-pipeline.ts here.
 */

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/** Extension derived from MIME type. */
function mimeToExt(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "bin";
  }
}

export type WritePaymentProofResult =
  | {
      ok: true;
      imageUrl: string;
      thumbnailUrl: string | null;
      sizeBytes: number;
      mimeType: string;
    }
  | { ok: false; error: string };

/**
 * Writes a payment-proof file to disk and optionally generates a 256px WebP
 * thumbnail (images only). Returns a discriminated result union.
 *
 * @param orderId - Order UUID. Sanitized to prevent path traversal.
 * @param file    - Web API File or Blob with `.type` and `.arrayBuffer()`.
 */
export async function writePaymentProof(
  orderId: string,
  file: File | Blob,
): Promise<WritePaymentProofResult> {
  // --- Validation ---
  if (!file || !file.type) {
    return { ok: false, error: "Invalid file." };
  }

  if (!ALLOWED_MIMES.has(file.type)) {
    return {
      ok: false,
      error: "Unsupported format. Allowed: JPG, PNG, WebP, HEIC, PDF.",
    };
  }

  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File exceeds 10 MB limit." };
  }

  // --- Path construction ---
  // Sanitize orderId to block path traversal (T-04-06 pattern).
  const safe = orderId.replace(/[^a-zA-Z0-9-]/g, "");
  const fileUuid = crypto.randomUUID();
  const ext = mimeToExt(file.type);

  const baseDir = path.join(
    process.cwd(),
    UPLOADS_DIR,
    "payment-proofs",
    safe,
  );

  // Path-traversal guard: ensure baseDir is inside UPLOADS_DIR.
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(baseDir).startsWith(root)) {
    return { ok: false, error: "Invalid order path." };
  }

  await fs.mkdir(baseDir, { recursive: true });

  // --- Write original file ---
  const buf = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(baseDir, `${fileUuid}.${ext}`);
  await fs.writeFile(filePath, buf);

  const imageUrl = `${PUBLIC_PREFIX}/payment-proofs/${safe}/${fileUuid}.${ext}`;

  // --- Thumbnail generation (images only; PDF passes through) ---
  let thumbnailUrl: string | null = null;

  if (file.type !== "application/pdf" && file.type.startsWith("image/")) {
    const thumbPath = path.join(baseDir, `${fileUuid}.thumb.webp`);
    try {
      await sharp(buf)
        .rotate() // Auto-orient using EXIF orientation tag
        .withMetadata({ exif: {} }) // Strip EXIF (PDPA: removes GPS, device info)
        .resize(256, 256, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      thumbnailUrl = `${PUBLIC_PREFIX}/payment-proofs/${safe}/${fileUuid}.thumb.webp`;
    } catch (err) {
      // Non-fatal per PATTERNS.md — proceed without thumbnail.
      console.warn("[payment-proof-storage] thumbnail generation failed:", err);
    }
  }

  return {
    ok: true,
    imageUrl,
    thumbnailUrl,
    sizeBytes: buf.length,
    mimeType: file.type,
  };
}
