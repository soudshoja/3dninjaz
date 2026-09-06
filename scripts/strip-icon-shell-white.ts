/**
 * Phase 25 gap-closure — strip the baked-in white/light-gray keycap shell
 * pixels from each icon webp so only the icon's own graphic stays opaque.
 *
 * Root cause: `top_N.png` (the Bambu Studio thumbnail source) is a flattened
 * render of the WHOLE physical keycap — the white plastic shell (rendered
 * with 3D shading, ~RGB 200-230 desaturated) plus the colour graphic on top —
 * not a transparent-background icon cutout. Only pixels outside the keycap's
 * rounded-square silhouette were ever transparent. This meant the "icon shell
 * follows Base colour" CSS fix had no visible effect: the CSS background sits
 * behind an opaque image that already fully covers the frame.
 *
 * Fix: chroma-key any near-white/desaturated pixel to transparent (soft
 * feather near the threshold to avoid hard jagged edges), leaving only the
 * icon's actual coloured/dark graphic opaque. This is a HEURISTIC — icons
 * whose own real graphic content is legitimately white/light-gray by design
 * (baseball body, golf ball, snowman body, candy-cane white stripes, Thor's
 * hammer silver head, etc.) will likely get partially stripped too and need
 * manual review/exception after running this (flagged by the human-verify
 * step in the gap-closure summary).
 *
 * Run (Git Bash): npx tsx scripts/strip-icon-shell-white.ts
 */
import { readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ICONS_DIR = path.join(__dirname, "..", "public", "icons", "keycaps");
// OneDrive holds locks on files in the synced tree that make direct
// overwrite unreliable (EPERM/UNKNOWN). Stage output outside OneDrive first.
const STAGING_DIR = "C:\\Users\\User\\AppData\\Local\\Temp\\claude\\icon-strip-staging";
mkdirSync(STAGING_DIR, { recursive: true });

async function copyWithRetry(src: string, dest: string, attempts = 8) {
  const fs = await import("node:fs/promises");
  for (let i = 0; i < attempts; i++) {
    try {
      const bytes = await fs.readFile(src);
      await fs.writeFile(dest, bytes);
      return;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

// Desaturation + lightness thresholds tuned from sampled shell pixels
// (~RGB 200-230, near-equal channels). Feather zone softens the cutoff edge.
const LIGHT_MIN = 150; // below this, always keep opaque (definitely graphic)
const LIGHT_MAX = 235; // above this + desaturated, always strip (definitely shell)
const SAT_MAX = 22; // max(R,G,B) - min(R,G,B) below this = "desaturated"

function shellAlphaFactor(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  if (sat > SAT_MAX) return 1; // saturated colour — never shell, keep fully opaque
  if (max <= LIGHT_MIN) return 1; // dark enough to be graphic (e.g. black outline)
  if (max >= LIGHT_MAX) return 0; // light + desaturated — shell, fully transparent
  // Feather zone: linear ramp from opaque at LIGHT_MIN to transparent at LIGHT_MAX
  return 1 - (max - LIGHT_MIN) / (LIGHT_MAX - LIGHT_MIN);
}

async function processIcon(file: string) {
  const filePath = path.join(ICONS_DIR, file);
  const { data, info } = await sharp(filePath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.from(data);

  for (let i = 0; i < width * height; i++) {
    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a === 0) continue; // already transparent
    const factor = shellAlphaFactor(r, g, b);
    out[idx + 3] = Math.round(a * factor);
  }

  const stagedPath = path.join(STAGING_DIR, file);
  await sharp(out, { raw: { width, height, channels } })
    .webp({ quality: 90 })
    .toFile(stagedPath);
  // NOTE: does NOT write back into public/icons/keycaps/ — Node's fs calls
  // hit a persistent OneDrive/Windows lock on that synced tree. Copy the
  // staged output over with a shell `cp` command afterward instead.
}

async function main() {
  const files = readdirSync(ICONS_DIR).filter((f) => f.endsWith(".webp"));
  console.info(`[strip-shell] processing ${files.length} icons in ${ICONS_DIR}`);
  for (const file of files) {
    await processIcon(file);
    console.info(`[strip-shell] done: ${file}`);
  }
  console.info(`[strip-shell] complete — ${files.length} icons processed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
