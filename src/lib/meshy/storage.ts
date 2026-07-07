import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MESHY_SOURCE_IMAGE_MAX_BYTES } from "./types";

/**
 * Phase 21 (21-02) — private Meshy model/photo storage.
 *
 * Root lives OUTSIDE the web-served uploads tree — model files must NEVER
 * be world-readable (unlike src/lib/storage.ts / payment-proof-storage.ts,
 * which intentionally write under the served uploads directory). The only
 * sanctioned read path for generated model files is the authed download
 * route (Plan 21-04): src/app/api/admin/meshy/[id]/download/route.ts
 *
 * Deploy note (21-PATTERNS §6): on prod, set MESHY_STORAGE_DIR to an
 * absolute path outside the deploy directory (e.g.
 * /home/ninjaz/persistent_meshy) so files survive redeploys, mirroring how
 * the served uploads directory is symlinked to
 * /home/ninjaz/persistent_uploads/. Deploy checklist item tracked in Plan
 * 21-05.
 */

const MESHY_STORAGE_DIR = process.env.MESHY_STORAGE_DIR ?? "./storage/meshy";

const ALLOWED_SOURCE_MIMES = new Set(["image/jpeg", "image/png"]);

function storageRoot(): string {
  return path.resolve(process.cwd(), MESHY_STORAGE_DIR);
}

/** Strip a generation id to a safe path segment — prevents path traversal via a crafted id. */
function safeGenerationId(id: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error("Invalid generation id");
  }
  return id;
}

/**
 * Resolves a relative storage path (as stored in the DB) to an absolute
 * filesystem path, with a path-traversal guard verbatim from
 * src/lib/storage.ts's convention. Used by the download route (Plan 21-04)
 * and internal reads.
 */
export function resolveStoragePath(relPath: string): string {
  const root = storageRoot();
  const abs = path.join(root, relPath);
  if (!path.resolve(abs).startsWith(root)) {
    throw new Error("Invalid storage path");
  }
  return abs;
}

export type WriteSourceImageResult =
  | { ok: true; relPath: string; mimeType: string }
  | { ok: false; error: string };

/**
 * Writes the admin's uploaded reference photo to
 * <MESHY_STORAGE_DIR>/<generationId>/source.<ext>. Returns a RELATIVE path
 * ("<generationId>/source.<ext>") — storing relative paths in the DB means
 * a prod root move (MESHY_STORAGE_DIR change) never invalidates existing rows.
 */
export async function writeSourceImage(
  generationId: string,
  file: File,
): Promise<WriteSourceImageResult> {
  if (!file || !file.type) {
    return { ok: false, error: "Invalid file." };
  }
  if (!ALLOWED_SOURCE_MIMES.has(file.type)) {
    return { ok: false, error: "Unsupported format. Allowed: JPG, PNG." };
  }
  if (file.size > MESHY_SOURCE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "File exceeds 10 MB limit." };
  }

  const safeId = safeGenerationId(generationId);
  const root = storageRoot();
  const dir = path.join(root, safeId);
  if (!path.resolve(dir).startsWith(root)) {
    return { ok: false, error: "Invalid storage path." };
  }

  const ext = file.type === "image/png" ? "png" : "jpg";
  const relPath = `${safeId}/source.${ext}`;

  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, `source.${ext}`), buf);

  return { ok: true, relPath, mimeType: file.type };
}

/**
 * Reads the stored source photo and base64-encodes it as a data URI. This
 * is HOW the reference photo reaches Meshy (image_url accepts data URIs
 * per api-reference.md) — deliberately chosen over a network-reachable URL
 * so nothing is exposed outside our own process, and dev machines with no
 * inbound reachability work identically (21-PATTERNS §6 decision).
 */
export async function readSourceImageAsDataUri(relPath: string): Promise<string> {
  const abs = resolveStoragePath(relPath);
  const buf = await fs.readFile(abs);
  const isPng = relPath.toLowerCase().endsWith(".png");
  const prefix = isPng ? "data:image/png;base64," : "data:image/jpeg;base64,";
  return `${prefix}${buf.toString("base64")}`;
}

export type DownloadMeshyAssetResult =
  | { ok: true; relPath: string }
  | { ok: false; error: string };

/**
 * Downloads a Meshy-hosted asset (model file or thumbnail) to our private
 * storage. Invoked by the pipeline the moment a task hits SUCCEEDED — before
 * any status advance (3-day expiry rule, 21-CONTEXT). Never throws on
 * network failure; the pipeline decides whether that is fatal (prod) or
 * tolerable (dev test-mode fake URLs).
 */
export async function downloadMeshyAsset(
  url: string,
  generationId: string,
  filename: "model.glb" | "model.stl" | "model.3mf" | "thumb.png",
): Promise<DownloadMeshyAssetResult> {
  const safeId = safeGenerationId(generationId);
  const root = storageRoot();
  const dir = path.join(root, safeId);
  if (!path.resolve(dir).startsWith(root)) {
    return { ok: false, error: "Invalid storage path." };
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: `Fetch failed: ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), buf);
    return { ok: true, relPath: `${safeId}/${filename}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown download error",
    };
  }
}
