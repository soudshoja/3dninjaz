// Final slice + optimize script for the 3D Ninjaz webicon sheet.
//
//   node scripts/slice-webicons.mjs
//
// Source: D:/Downloads/webicon.png (1402x1122, opaque white bg).
// Output: public/icons/ninja/{logo,favicon-*,errors,emoji,nav}
//
// Coordinates are manually declared below, derived from the probe scripts
// (slice-webicons-probe.mjs / probe2.mjs / probe3.mjs) cross-referenced with
// the source sheet's visible grid. Per-row y-bands were auto-detected; per-
// column x-bands were refined by hand because the icons have internal
// transparent gaps (e.g., lightbulb rays) that confuse naive density bands.
//
// For each icon we output:
//   - ${slug}.png (512x512, sharp palette PNG for small size)
//   - ${slug}.webp (512x512)
// Nav + emoji rows additionally get ${slug}@128.png for inline use.
//
// All images are trimmed (whitespace removed) and then centered on a 512x512
// transparent canvas. Since the source has no alpha, we flatten white →
// transparent via `.flatten({ background: '#ffffff' })` + `.ensureAlpha()`
// + sharp.trim({ background: '#ffffff', threshold: 12 }) which drops the
// white border cleanly.

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const SRC = "D:/Downloads/webicon.png";
const ROOT = path.resolve("public/icons/ninja");
const ROOT_APP = path.resolve("src/app"); // for favicons

// Manual coords, px, in the 1402x1122 source. [x0, y0, x1, y1].
// Derived from probe scans + manual calibration. Keep generous padding so
// icon edges are not clipped; the trim step removes whitespace afterwards.
const REGIONS = [
  // --- Row 1 — logo + HTTP 4xx ---
  // Logo crop is wider and includes the "FAVICON (512x512)" label underneath
  // but that label is thin vs. the logo so trim throws it away cleanly.
  // Error icons: crop the illustration ONLY — not the big "400/401/403/404"
  // number below nor the body copy further down. Ink band detected at
  // y=95..275 covers both the ninja and the number. The illustration alone
  // sits y~95..265 — but the number "4xx" is big and survives trim, so we
  // crop tightly to y=95..265 and kill the text by bounding the box.
  // Logo: wide crop — trim will strip the small "FAVICON (512x512)" label.
  { slug: "logo", x: 55, y: 80, w: 430, h: 300 },
  // Row 1 4xx — ninja illustrations only, NO big 4xx digit. The digits sit
  // at y~265..310; ninja occupies y~95..240 tightly.
  { slug: "errors/400", x: 510, y: 90, w: 170, h: 160 },
  { slug: "errors/401", x: 715, y: 90, w: 185, h: 160 },
  { slug: "errors/403", x: 905, y: 90, w: 215, h: 160 },
  { slug: "errors/404", x: 1125, y: 90, w: 210, h: 160 },

  // Row 2 5xx + maintenance.
  // Measured: y~430-450 = "FAVICON (512x512)" caption, y~465..580 = ninja
  // illustrations (hard-hat top peaks ~470, feet bottom ~580), y~585+ = big
  // 500/502/… numbers. Crop y=465..580 (h=115) keeps the ninja only.
  { slug: "errors/500", x: 95, y: 465, w: 200, h: 115 },
  { slug: "errors/502", x: 335, y: 465, w: 210, h: 115 },
  { slug: "errors/503", x: 610, y: 465, w: 200, h: 115 },
  { slug: "errors/504", x: 835, y: 465, w: 215, h: 115 },
  { slug: "errors/maintenance", x: 1105, y: 465, w: 225, h: 115 },

  // Row 3 emoji.
  // Measured strips: y~760..780 = "NINJA ICONS FOR WEBSITE" header, y~785..875
  // = ninja illustrations, y~885..905 = "HELLO!/GREAT!/…" labels.
  // Crop y=785..880 (h=95) captures the ninja only.
  { slug: "emoji/hello",     x: 40,   y: 785, w: 145, h: 100 },
  { slug: "emoji/great",     x: 200,  y: 785, w: 145, h: 100 },
  { slug: "emoji/thank-you", x: 375,  y: 785, w: 140, h: 100 },
  { slug: "emoji/tip",       x: 525,  y: 785, w: 180, h: 100 },
  { slug: "emoji/success",   x: 720,  y: 785, w: 160, h: 100 },
  { slug: "emoji/warning",   x: 890,  y: 785, w: 170, h: 100 },
  { slug: "emoji/contact",   x: 1075, y: 785, w: 160, h: 100 },
  { slug: "emoji/secure",    x: 1230, y: 785, w: 135, h: 100 },

  // Row 4 nav.
  // Measured strips: y~940..955 = "EXTRA WEB ICONS" header, y~965..1060 = ninja
  // illustrations, y~1070..1095 = "HOME/ABOUT US/…" labels. Crop y=965..1060
  // keeps the illustration only.
  { slug: "nav/home",      x: 20,   y: 965, w: 115, h: 95 },
  { slug: "nav/about",     x: 135,  y: 965, w: 115, h: 95 },
  { slug: "nav/services",  x: 250,  y: 965, w: 115, h: 95 },
  { slug: "nav/portfolio", x: 365,  y: 965, w: 115, h: 95 },
  { slug: "nav/blog",      x: 480,  y: 965, w: 115, h: 95 },
  { slug: "nav/shop",      x: 595,  y: 965, w: 115, h: 95 },
  { slug: "nav/support",   x: 710,  y: 965, w: 115, h: 95 },
  { slug: "nav/faq",       x: 830,  y: 965, w: 115, h: 95 },
  { slug: "nav/download",  x: 950,  y: 965, w: 115, h: 95 },
  { slug: "nav/login",     x: 1060, y: 965, w: 115, h: 95 },
  { slug: "nav/signup",    x: 1170, y: 965, w: 115, h: 95 },
  { slug: "nav/search",    x: 1270, y: 965, w: 115, h: 95 },
];

// Slugs that also get a 128x128 variant.
const SMALL_VARIANT_GROUPS = ["emoji/", "nav/"];

// Favicon source (the logo), cropped tightly to the ninja+text block only.
// Favicon uses a tight crop of the logo center (character + text) and we
// generate multiple sizes from a single 512 source.

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function sliceOne(r) {
  const outPath = path.join(ROOT, `${r.slug}.png`);
  const outWebp = path.join(ROOT, `${r.slug}.webp`);
  await ensureDir(path.dirname(outPath));

  // Step 1: crop raw region, flatten white→transparent by matching threshold,
  // trim surrounding whitespace, center on 512x512 transparent canvas.
  const cropped = await sharp(SRC)
    .extract({ left: r.x, top: r.y, width: r.w, height: r.h })
    .toBuffer();

  // Make background transparent: sharp's `trim` works on near-uniform edges.
  // Since source has no alpha, we add it and trim against the dominant
  // white background (threshold tuned to leave anti-aliased edges alone).
  const trimmed = await sharp(cropped)
    .ensureAlpha()
    .trim({ background: { r: 255, g: 255, b: 255, alpha: 1 }, threshold: 18 })
    .toBuffer();

  const m = await sharp(trimmed).metadata();
  const W = m.width ?? r.w;
  const H = m.height ?? r.h;
  // Scale the trimmed icon to fit within a 460x460 area on a 512 canvas
  // (26px padding on all sides).
  const maxInner = 460;
  const scale = Math.min(maxInner / W, maxInner / H);
  const newW = Math.max(1, Math.round(W * scale));
  const newH = Math.max(1, Math.round(H * scale));

  const resized = await sharp(trimmed)
    .resize(newW, newH, { fit: "inside", kernel: "lanczos3" })
    .toBuffer();

  // Composite onto a 512 transparent canvas, then flatten white→transparent
  // by converting any near-white pixel to alpha 0 using a remove-bg step.
  // Trick: use `composite` with `blend: "dest-in"` isn't supported for color
  // keying; instead we use a manual approach — convert to raw, zero-alpha
  // near-white pixels.
  const rawCanvas = await sharp({
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
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Raw pixel pass: any pixel whose RGB is >= 245 on all channels gets alpha 0.
  // Soft white-fringe pixels (230-245) get partial alpha for smooth edges.
  const { data, info } = rawCanvas;
  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r8 = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a === 0) continue;
    const minC = Math.min(r8, g, b);
    if (minC >= 245) {
      pixels[i + 3] = 0; // full transparent
    } else if (minC >= 220) {
      // partial fade to kill white halo
      const t = (minC - 220) / 25; // 0..1
      pixels[i + 3] = Math.round(a * (1 - t * 0.85));
    }
  }

  // Write PNG (palette for mascot art — massive size reduction)
  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: true })
    .toFile(outPath);

  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 85, alphaQuality: 90 })
    .toFile(outWebp);

  // Small 128 variant for emoji/ + nav/
  if (SMALL_VARIANT_GROUPS.some((p) => r.slug.startsWith(p))) {
    const small = path.join(ROOT, `${r.slug}@128.png`);
    await sharp(pixels, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .resize(128, 128, { fit: "inside", kernel: "lanczos3" })
      .png({ compressionLevel: 9, palette: true })
      .toFile(small);
  }

  const [stPng, stWebp] = await Promise.all([
    fs.stat(outPath),
    fs.stat(outWebp),
  ]);
  console.log(
    `${r.slug.padEnd(22)}  png=${(stPng.size / 1024).toFixed(1)}KB  webp=${(stWebp.size / 1024).toFixed(1)}KB`,
  );

  return { slug: r.slug, png: outPath, webp: outWebp };
}

async function buildFavicons(logoPath) {
  // Derive favicon sources directly from the logo crop (same character + text
  // that users will see in their browser tab). We create:
  //   src/app/icon-16.png   — 16x16
  //   src/app/icon-32.png   — 32x32
  //   src/app/icon-192.png  — 192x192
  //   src/app/icon-512.png  — 512x512
  //   src/app/icon.png      — master 512x512
  //   src/app/apple-icon.png — 180x180
  //   src/app/favicon.ico   — 16+32+48 multi-size
  //   public/icons/ninja/favicon-512.png — convenience copy
  const favCopy = path.join(ROOT, "favicon-512.png");
  await sharp(logoPath).resize(512, 512, { fit: "inside" }).png({ compressionLevel: 9, palette: true }).toFile(favCopy);

  const sizes = [
    { file: "icon.png", size: 512 },
    { file: "icon-512.png", size: 512 },
    { file: "icon-192.png", size: 192 },
    { file: "icon-32.png", size: 32 },
    { file: "icon-16.png", size: 16 },
    { file: "apple-icon.png", size: 180 },
  ];
  for (const s of sizes) {
    const out = path.join(ROOT_APP, s.file);
    await sharp(logoPath)
      .resize(s.size, s.size, { fit: "inside" })
      .png({ compressionLevel: 9, palette: s.size <= 64 ? false : true })
      .toFile(out);
    const st = await fs.stat(out);
    console.log(`fav ${s.file.padEnd(18)} ${s.size}px  ${(st.size / 1024).toFixed(1)}KB`);
  }

  // favicon.ico — write a PNG-in-ICO wrapper containing 16/32/48 frames.
  // sharp can't write .ico directly; build the ICO header manually.
  const sizeSet = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizeSet.map((n) => sharp(logoPath).resize(n, n, { fit: "inside" }).png({ compressionLevel: 9 }).toBuffer()),
  );
  const ico = buildIco(sizeSet, pngBuffers);
  const icoOut = path.join(ROOT_APP, "favicon.ico");
  await fs.writeFile(icoOut, ico);
  const st = await fs.stat(icoOut);
  console.log(`fav favicon.ico       (16/32/48)  ${(st.size / 1024).toFixed(1)}KB`);
}

function buildIco(sizes, pngs) {
  // ICO header: 6 bytes. Each dir entry: 16 bytes. Then image data.
  const count = sizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: 1 = ico
  header.writeUInt16LE(count, 4);  // image count

  const dir = Buffer.alloc(16 * count);
  const images = [];
  let offset = 6 + 16 * count;

  for (let i = 0; i < count; i++) {
    const s = sizes[i];
    const data = pngs[i];
    dir.writeUInt8(s >= 256 ? 0 : s, i * 16 + 0); // width (0 = 256)
    dir.writeUInt8(s >= 256 ? 0 : s, i * 16 + 1); // height
    dir.writeUInt8(0, i * 16 + 2);                // color palette count
    dir.writeUInt8(0, i * 16 + 3);                // reserved
    dir.writeUInt16LE(1, i * 16 + 4);             // color planes
    dir.writeUInt16LE(32, i * 16 + 6);            // bpp
    dir.writeUInt32LE(data.length, i * 16 + 8);   // image size
    dir.writeUInt32LE(offset, i * 16 + 12);       // offset
    offset += data.length;
    images.push(data);
  }
  return Buffer.concat([header, dir, ...images]);
}

async function main() {
  const meta = await sharp(SRC).metadata();
  console.log(`Source: ${meta.width}x${meta.height}, ${meta.channels}ch, alpha=${meta.hasAlpha}`);
  await ensureDir(ROOT);
  await ensureDir(path.join(ROOT, "errors"));
  await ensureDir(path.join(ROOT, "emoji"));
  await ensureDir(path.join(ROOT, "nav"));

  const results = [];
  for (const r of REGIONS) {
    results.push(await sliceOne(r));
  }

  // Build favicons from the logo PNG we just produced.
  const logoOut = path.join(ROOT, "logo.png");
  await buildFavicons(logoOut);

  console.log(`\nDone. ${results.length} regions sliced.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
