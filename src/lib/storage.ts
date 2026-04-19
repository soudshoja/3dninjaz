import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    default:
      return "jpg";
  }
}

function safeBucket(input: string): string {
  // Bucket must be "new" or a UUID — anything else we sanitize to alphanum+dash
  // to prevent path traversal (T-04-06).
  if (input === "new") return "new";
  const sanitized = input.replace(/[^a-zA-Z0-9-]/g, "");
  return sanitized.length > 0 ? sanitized : "new";
}

export async function writeUpload(bucket: string, file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) {
    throw new Error("Unsupported image type (allowed: JPEG, PNG, WebP)");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large (max 5 MB)");
  }

  const safe = safeBucket(bucket);
  const ext = extensionForMime(file.type);
  const name = `${crypto.randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), UPLOADS_DIR, "products", safe);
  await fs.mkdir(dir, { recursive: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  const absPath = path.join(dir, name);

  // Double-check path stays inside UPLOADS_DIR.
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(absPath).startsWith(root)) {
    throw new Error("Invalid upload path");
  }

  await fs.writeFile(absPath, bytes);

  return `${PUBLIC_PREFIX}/products/${safe}/${name}`;
}

export async function deleteUpload(publicUrl: string): Promise<void> {
  if (!publicUrl.startsWith(PUBLIC_PREFIX + "/")) return;
  const rel = publicUrl.slice(PUBLIC_PREFIX.length + 1);
  const abs = path.join(process.cwd(), UPLOADS_DIR, rel);
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  // Path-traversal guard (T-04-06).
  if (!path.resolve(abs).startsWith(root)) return;
  try {
    await fs.unlink(abs);
  } catch {
    // Swallow — the file may already be gone, or the path may be on a
    // different filesystem. Product references are cleaned separately.
  }
}

export function publicUrlFor(bucket: string, filename: string): string {
  return `${PUBLIC_PREFIX}/products/${safeBucket(bucket)}/${filename}`;
}
