// Slice + optimize the 3D Ninjaz social icon sheet.
//
//   node scripts/slice-social-icons.mjs
//
// Source: D:/Downloads/social.png (1536x1024, dark background, 2x3 grid of
// ninja mascots each holding a platform icon).
//
// Layout (row-major):
//   Row 1: Twitter/X   · WhatsApp · Instagram
//   Row 2: Facebook    · TikTok   · Thumbs-up (generic "like"/review)
//
// For each of the 6 icons we output:
//   - ${slug}.png   (512x512, palette PNG — keeps size small)
//   - ${slug}.webp  (512x512, quality 85)
//   - ${slug}@128.png (128x128 variant for inline use)
//
// The source has a DARK background (near-black), unlike the webicon sheet.
// We crop each cell, then in raw-pixel mode knock out the near-black
// background to alpha 0 so the icons sit cleanly on the storefront's cream
// background. A tight y-bound strips the baked-in name labels under row 1.

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const SRC = "D:/Downloads/social.png";
const ROOT = path.resolve("public/icons/ninja/social");

// Source is 1536x1024. The image is a 3-col × 2-row grid but the content
// does not fill the entire frame — there's a ~40px margin around the edges
// and the bottom row sits a little lower. These coords are derived from the
// visual grid — we crop generously and rely on the alpha-key pass + trim to
// center the mascot. Y-bands are deliberately tight to kill the small name
// labels under row 1 (blue/green/purple text baked into the background).
//
// Row 1: y ~= 20..430  (mascot+icon; labels below at ~435..490)
// Row 2: y ~= 515..975 (mascot+icon; no labels)
// Col widths are ~512 each (1536 / 3) with slight asymmetry.
const REGIONS = [
  // --- Row 1 ---
  { slug: "twitter",   x: 20,   y: 20,  w: 495, h: 410 },
  { slug: "whatsapp",  x: 520,  y: 20,  w: 495, h: 410 },
  { slug: "instagram", x: 1020, y: 20,  w: 495, h: 410 },
  // --- Row 2 ---
  { slug: "facebook",  x: 20,   y: 515, w: 495, h: 465 },
  { slug: "tiktok",    x: 520,  y: 515, w: 495, h: 465 },
  { slug: "like",      x: 1020, y: 515, w: 495, h: 465 },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function sliceOne(r) {
  const outPng = path.join(ROOT, `${r.slug}.png`);
  const outWebp = path.join(ROOT, `${r.slug}.webp`);
  const outSmall = path.join(ROOT, `${r.slug}@128.png`);

  // Step 1: extract the cell as raw RGBA.
  const cell = await sharp(SRC)
    .extract({ left: r.x, top: r.y, width: r.w, height: r.h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Step 2: raw-pixel pass — knock out the near-black background.
  // The dark bg is not uniform — there's a subtle gradient and a colored
  // glow behind each mascot. We treat pixels whose luminance is below a
  // low threshold AND whose saturation is low (grey/dark) as background.
  // A partial fade zone prevents hard edges.
  const { data, info } = cell;
  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r8 = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a === 0) continue;
    const maxC = Math.max(r8, g, b);
    const minC = Math.min(r8, g, b);
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
    // Pure black/dark pixels: maxC low AND saturation low → drop.
    // Colored glow pixels (blue/green/purple halos around mascots) have
    // higher saturation and medium max → keep them, they become soft halo.
    if (maxC <= 30 && sat < 0.25) {
      pixels[i + 3] = 0;
    } else if (maxC <= 55 && sat < 0.20) {
      // Partial fade zone — keep edge pixels semi-transparent to avoid
      // visible black rim.
      const t = (maxC - 30) / 25; // 0..1
      pixels[i + 3] = Math.round(a * t * 0.7);
    }
  }

  // Step 3: re-encode → trim → center on 512.
  const keyed = await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const trimmed = await sharp(keyed)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .toBuffer();

  const m = await sharp(trimmed).metadata();
  const W = m.width ?? r.w;
  const H = m.height ?? r.h;
  const maxInner = 460; // 26px padding inside 512 canvas
  const scale = Math.min(maxInner / W, maxInner / H, 1);
  const newW = Math.max(1, Math.round(W * scale));
  const newH = Math.max(1, Math.round(H * scale));

  const resized = await sharp(trimmed)
    .resize(newW, newH, { fit: "inside", kernel: "lanczos3" })
    .toBuffer();

  const canvas = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resized,
        left: Math.floor((512 - newW) / 2),
        top: Math.floor((512 - newH) / 2),
      },
    ])
    .png()
    .toBuffer();

  // Step 4: write outputs.
  // Palette PNG keeps file size tiny for mascot-style art.
  await sharp(canvas)
    .png({ compressionLevel: 9, palette: true })
    .toFile(outPng);

  await sharp(canvas)
    .webp({ quality: 85, alphaQuality: 90 })
    .toFile(outWebp);

  await sharp(canvas)
    .resize(128, 128, { fit: "inside", kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true })
    .toFile(outSmall);

  const [stPng, stWebp, stSmall] = await Promise.all([
    fs.stat(outPng),
    fs.stat(outWebp),
    fs.stat(outSmall),
  ]);
  console.log(
    `${r.slug.padEnd(10)}  png=${(stPng.size / 1024).toFixed(1)}KB  webp=${(stWebp.size / 1024).toFixed(1)}KB  @128=${(stSmall.size / 1024).toFixed(1)}KB`,
  );
}

async function main() {
  const meta = await sharp(SRC).metadata();
  console.log(
    `Source: ${meta.width}x${meta.height}, ${meta.channels}ch, alpha=${meta.hasAlpha}`,
  );
  await ensureDir(ROOT);
  for (const r of REGIONS) {
    await sliceOne(r);
  }
  console.log(`\nDone. ${REGIONS.length} icons written to ${ROOT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
