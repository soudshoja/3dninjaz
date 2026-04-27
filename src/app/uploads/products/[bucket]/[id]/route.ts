import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Phase 7 (07-08) ships uploads as DIRECTORY URLs, e.g.
 *   /uploads/products/<bucket>/<id>
 * containing manifest.json + variants. Files INSIDE the directory
 * (e.g. /uploads/products/<bucket>/<id>/1600w.jpg) are served as static files
 * by Next.js automatically.
 *
 * But Next.js / Apache return 404 for the directory itself. The admin image
 * grid + Next <Image src={baseUrl}> callers expect baseUrl to resolve to an
 * actual image. Without this handler they render as broken thumbnails.
 *
 * This route handler:
 *   1. Reads manifest.json from the upload directory.
 *   2. Picks the largest JPEG variant (broadest browser support).
 *   3. 302 redirects to it.
 *
 * Storefront <picture> shells still call pickImage() server-side to read the
 * full manifest and emit srcset — they don't go through this redirect path.
 */

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";

type Manifest = {
  variants: Array<{ width: number; webp: string; avif: string; jpg: string }>;
};

function safeSegment(s: string): string {
  if (s === "new") return "new";
  return s.replace(/[^a-zA-Z0-9-]/g, "");
}

export async function GET(
  _: Request,
  ctx: { params: Promise<{ bucket: string; id: string }> },
): Promise<Response> {
  const { bucket: rawBucket, id: rawId } = await ctx.params;
  const bucket = safeSegment(rawBucket);
  const id = safeSegment(rawId);
  if (!bucket || !id) {
    return new Response("Not found", { status: 404 });
  }
  const dir = path.join(process.cwd(), UPLOADS_DIR, "products", bucket, id);
  // Path-traversal guard.
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(dir).startsWith(root)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const text = await fs.readFile(path.join(dir, "manifest.json"), "utf8");
    const m = JSON.parse(text) as Manifest;
    const variant = m.variants[m.variants.length - 1];
    if (!variant?.jpg) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${PUBLIC_PREFIX}/products/${bucket}/${id}/${variant.jpg}`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
