import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Serves individual variant files within a processed image directory.
 *
 * URLs:  /uploads/products/<bucket>/<id>/<file>
 * e.g.:  /uploads/products/abc123/def456/400w.avif
 *        /uploads/products/abc123/def456/manifest.json
 *
 * Why this route handler exists instead of relying on Next.js static serving:
 *   The App Router has a route handler at /uploads/products/[bucket]/[id]
 *   (serves the directory URL as JPEG bytes for Next.js <Image> optimizer).
 *   Next.js App Router routing takes precedence over public/ static file
 *   serving for paths that share a prefix with a registered route, so any
 *   request to /uploads/products/<bucket>/<id>/<file> falls into the router
 *   and gets a 404 instead of reading from public/uploads.
 *
 * This handler bridges the gap: it reads variant files directly from disk
 * and streams them with the correct Content-Type and long-cache headers.
 *
 * Allowed extensions: avif, webp, jpg, jpeg, png, json
 * All other file names return 404 (no directory traversal; safeSegment strips
 * path separators and ".." components before any fs access).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";

const MIME: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  json: "application/json",
};

function safeSegment(s: string): string {
  // Strip path separators and ".." to prevent traversal.
  return s.replace(/[^a-zA-Z0-9._-]/g, "");
}

export async function GET(
  _: Request,
  ctx: { params: Promise<{ bucket: string; id: string; file: string }> },
): Promise<Response> {
  const { bucket: rawBucket, id: rawId, file: rawFile } = await ctx.params;

  const bucket = safeSegment(rawBucket);
  const id = safeSegment(rawId);
  const file = safeSegment(rawFile);

  if (!bucket || !id || !file) {
    return new Response("Not found", { status: 404 });
  }

  // Only serve known extensions.
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), UPLOADS_DIR, "products", bucket, id, file);

  // Path-traversal guard: resolved path must stay inside UPLOADS_DIR.
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(filePath).startsWith(root)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await fs.readFile(filePath);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.byteLength),
        // Images are content-addressed (UUID path) — safe to cache long-term.
        // manifest.json uses a shorter TTL since it describes the variant set.
        "Cache-Control":
          ext === "json"
            ? "public, max-age=300"
            : "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
