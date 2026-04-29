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
 * actual image.
 *
 * IMPORTANT: Next.js <Image> uses an internal image optimizer that fetches the
 * upstream URL via a mocked request handler — it does NOT follow HTTP 302
 * redirects. If this handler returns a redirect, the optimizer receives an
 * empty buffer and throws "The requested resource isn't a valid image" (400).
 *
 * This handler instead reads the JPEG bytes from disk and returns them directly
 * with a 200 response so the optimizer can process real image data.
 *
 * Storefront <picture> shells still call pickImage() server-side to read the
 * full manifest and emit srcset — they don't go through this handler.
 */

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";

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
    // Pick the largest JPEG variant (broadest browser support).
    const variant = m.variants[m.variants.length - 1];
    if (!variant?.jpg) {
      return new Response("Not found", { status: 404 });
    }
    const jpgPath = path.join(dir, variant.jpg);
    // Path-traversal guard on the variant filename.
    if (!path.resolve(jpgPath).startsWith(path.resolve(dir))) {
      return new Response("Not found", { status: 404 });
    }
    const data = await fs.readFile(jpgPath);
    // Return image bytes directly — do NOT redirect. Next.js <Image> optimizer
    // uses internal mock-request routing and cannot follow 302 redirects; a
    // redirect results in an empty buffer → 400 "not a valid image".
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(data.byteLength),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
