import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Phase 7 (07-08) — manifest reader for the storefront `<picture>` shell.
 *
 * `pickImage(baseUrl)` returns a PictureData for the responsive image
 * component. Two URL shapes supported:
 *   - NEW directory shape: /uploads/products/<bucket>/<id>
 *     -> reads <id>/manifest.json, emits 3 sources (avif/webp/jpg) with
 *        srcset enumerating all widths present.
 *   - LEGACY file shape: /uploads/products/<bucket>/<id>.jpg
 *     -> emits empty sources[] + fallbackSrc=baseUrl. Component renders
 *        a plain <img>. Backfill script converts these in bulk.
 */

export type PictureSource = {
  type: "image/avif" | "image/webp" | "image/jpeg";
  srcSet: string;
};

export type PictureData = {
  sources: PictureSource[];
  fallbackSrc: string;
};

function isLegacyUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(url);
}

export async function pickImage(
  baseUrl: string,
  opts: { uploadsDir?: string; publicPrefix?: string } = {},
): Promise<PictureData> {
  if (!baseUrl) return { sources: [], fallbackSrc: "" };
  if (isLegacyUrl(baseUrl)) {
    return { sources: [], fallbackSrc: baseUrl };
  }
  const publicPrefix = opts.publicPrefix ?? "/uploads";
  const uploadsRoot =
    opts.uploadsDir ?? path.join(process.cwd(), "public", "uploads");
  const rel = baseUrl.startsWith(publicPrefix + "/")
    ? baseUrl.slice(publicPrefix.length + 1)
    : baseUrl.replace(/^\//, "");
  const dir = path.join(uploadsRoot, rel);
  try {
    const text = await fs.readFile(path.join(dir, "manifest.json"), "utf8");
    const m = JSON.parse(text) as {
      widths: number[];
      variants: Array<{
        width: number;
        webp: string;
        avif: string;
        jpg: string;
      }>;
    };
    const baseUrlSlash = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    const srcSet = (key: "webp" | "avif" | "jpg") =>
      m.variants
        .map((v) => `${baseUrlSlash}${v[key]} ${v.width}w`)
        .join(", ");
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
    // Manifest missing or corrupt — log so the server monitor catches it,
    // then try to serve the first *.jpg in the directory as a best-effort
    // fallback instead of the bare directory URL (which returns a 404/403).
    console.error("[pickImage] manifest read failed:", baseUrl, err);
    try {
      const entries = await fs.readdir(dir);
      const jpg = entries.find((f) => f.endsWith(".jpg"));
      if (jpg) {
        const baseUrlSlash = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        return { sources: [], fallbackSrc: `${baseUrlSlash}${jpg}` };
      }
    } catch {
      // Directory unreadable — fall through to bare-URL fallback below.
    }
    return { sources: [], fallbackSrc: baseUrl };
  }
}
