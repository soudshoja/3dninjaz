import "server-only";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Phase 7 (07-08) — sharp-based image pipeline.
 *
 * Takes a raw image buffer, writes 9 variants (3 widths × 3 formats) + 1
 * original backup + manifest.json into a baseDir. Every variant is
 * downscale-only — we never upscale. Quality: WebP 78, AVIF 60, JPEG 82
 * (mozjpeg).
 *
 * Hard guardrails (T-07-08-image-DoS):
 *   - 10 MB pre-compress cap
 *   - 100M-pixel area cap (post-decode dimensions)
 *   - animated GIF > 5s rejected
 *   - mime sniffed via magic bytes (ignores multipart Content-Type header)
 */

const WIDTHS = [400, 480, 800, 960, 1440, 1600] as const;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_PIXEL_AREA = 100_000_000; // 10_000 × 10_000

export type ImageManifest = {
  widths: number[];
  variants: Array<{
    width: number;
    webp: string;
    avif: string;
    jpg: string;
  }>;
  original: string;
  sourceWidth: number;
  sourceHeight: number;
};

function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf.slice(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.slice(0, 4).toString("ascii") === "GIF8") return "image/gif";
  return null;
}

export async function compressUploadedImage(
  buf: Buffer,
  baseDir: string,
  opts: { skipBackup?: boolean } = {},
): Promise<ImageManifest> {
  if (buf.length > MAX_INPUT_BYTES) {
    throw new Error("Image exceeds 10MB cap");
  }
  const mime = sniffMime(buf);
  if (!mime) throw new Error("Unrecognized image format");

  await fs.mkdir(baseDir, { recursive: true });
  const ext =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : "gif";

  const meta = await sharp(buf, { failOn: "error" }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w * h > MAX_PIXEL_AREA) {
    throw new Error("Image dimensions too large (> 100M pixels)");
  }
  // Animated GIF guard
  if (meta.pages && meta.pages > 1) {
    const delay = meta.delay ?? [];
    const totalMs = delay.reduce((a, b) => a + b, 0);
    if (totalMs > 5000) {
      throw new Error("Animated GIF longer than 5s rejected");
    }
  }

  if (!opts.skipBackup) {
    await fs.writeFile(path.join(baseDir, `orig.${ext}`), buf);
  }

  const variants: ImageManifest["variants"] = [];
  for (const targetW of WIDTHS) {
    if (targetW > w + 1) continue; // skip upscale
    const pipeline = () =>
      sharp(buf, { failOn: "error" })
        .rotate()
        .resize({ width: targetW, withoutEnlargement: true });
    const webpFile = `${targetW}w.webp`;
    const avifFile = `${targetW}w.avif`;
    const jpgFile = `${targetW}w.jpg`;
    await pipeline().webp({ quality: 78 }).toFile(path.join(baseDir, webpFile));
    await pipeline().avif({ quality: 60 }).toFile(path.join(baseDir, avifFile));
    await pipeline()
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(baseDir, jpgFile));
    variants.push({
      width: targetW,
      webp: webpFile,
      avif: avifFile,
      jpg: jpgFile,
    });
  }

  // If source < 400px, still emit one variant at source width.
  if (variants.length === 0) {
    const targetW = w || 400;
    const pipeline = () =>
      sharp(buf, { failOn: "error" })
        .rotate()
        .resize({ width: targetW, withoutEnlargement: true });
    const webpFile = `${targetW}w.webp`;
    const avifFile = `${targetW}w.avif`;
    const jpgFile = `${targetW}w.jpg`;
    await pipeline().webp({ quality: 78 }).toFile(path.join(baseDir, webpFile));
    await pipeline().avif({ quality: 60 }).toFile(path.join(baseDir, avifFile));
    await pipeline()
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(baseDir, jpgFile));
    variants.push({
      width: targetW,
      webp: webpFile,
      avif: avifFile,
      jpg: jpgFile,
    });
  }

  const manifest: ImageManifest = {
    widths: variants.map((v) => v.width),
    variants,
    original: `orig.${ext}`,
    sourceWidth: w,
    sourceHeight: h,
  };
  await fs.writeFile(
    path.join(baseDir, "manifest.json"),
    JSON.stringify(manifest),
  );
  return manifest;
}
