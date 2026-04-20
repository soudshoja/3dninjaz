// Generates About Us siblings hero webp variant from the source PNG.
//
//   node scripts/process-about-hero.mjs
//
// Source: public/about/siblings-hero.png
// Output:
//   public/about/siblings-hero.webp  (85% quality, full size)
//   public/about/siblings-hero-1200.webp (resized width=1200 for desktop)
//   public/about/siblings-hero-800.webp  (resized width=800 for mobile)
//
// The <picture> element in /about prefers the smallest that covers the
// viewport.

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve("public/about/siblings-hero.png");

async function main() {
  const meta = await sharp(SRC).metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  // Full-quality webp
  const out1 = path.resolve("public/about/siblings-hero.webp");
  await sharp(SRC)
    .webp({ quality: 88 })
    .toFile(out1);

  // 1200w desktop
  const out2 = path.resolve("public/about/siblings-hero-1200.webp");
  await sharp(SRC)
    .resize(1200, null, { withoutEnlargement: true, kernel: "lanczos3" })
    .webp({ quality: 85 })
    .toFile(out2);

  // 800w mobile
  const out3 = path.resolve("public/about/siblings-hero-800.webp");
  await sharp(SRC)
    .resize(800, null, { withoutEnlargement: true, kernel: "lanczos3" })
    .webp({ quality: 82 })
    .toFile(out3);

  for (const f of [out1, out2, out3]) {
    const st = await fs.stat(f);
    console.log(`${path.basename(f).padEnd(32)} ${(st.size / 1024).toFixed(1)} KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
