/**
 * One-off (25-GAP-01) — regenerate the 34 committed keycap icons with the
 * corrected trim+pad crop.
 *
 * The originally-committed `public/icons/keycaps/<id>.webp` files are 512×512
 * canvases whose visible content only occupies ~38×38px, so they render as a
 * few unreadable pixels at the 40–56px display sizes used across the app. This
 * script re-extracts the raw `Metadata/top_N.png` renders from the SAME source
 * 3mf, applies the SAME trim+pad logic now in extract-keycap-icons.ts, and
 * overwrites each committed asset in place — WITHOUT re-running the human
 * plate→id verification (the mapping is already approved: plate order is 1:1
 * with KEYCAP_ICONS catalog order).
 *
 * Run (Git Bash):  npx tsx scripts/regen-keycap-icons.ts
 * Safe to delete after running.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { KEYCAP_ICONS } from "../src/lib/keycap-icons";

const PROJECT_ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "public", "icons", "keycaps");
const STAGING_DIR = path.join(OUT_DIR, "_regen-staging");
const SOURCE_3MF = "D:/Downloads/M batch3 keycaps p2s.3mf";
const EXPECTED_COUNT = 34;

/** Same crop logic as extract-keycap-icons.ts cropIconToWebp (kept local to
 *  avoid importing that module, whose top-level main() would auto-run). */
async function cropIconToWebp(srcPath: string, outPath: string) {
  const trimmed = await sharp(srcPath)
    .trim({ threshold: 10 })
    .toBuffer({ resolveWithObject: true });
  const tw = trimmed.info.width;
  const th = trimmed.info.height;
  const longest = Math.max(tw, th);
  const margin = Math.round(longest * 0.16);
  const target = longest + margin * 2;
  const left = Math.round((target - tw) / 2);
  const right = target - tw - left;
  const top = Math.round((target - th) / 2);
  const bottom = target - th - top;
  await sharp(trimmed.data)
    .extend({ top, bottom, left, right, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82 })
    .toFile(outPath);
  return { width: target, height: target, contentW: tw, contentH: th };
}

async function main() {
  if (!existsSync(SOURCE_3MF)) {
    throw new Error(`Source 3mf not found: ${SOURCE_3MF}`);
  }
  console.info(`[regen] source: ${SOURCE_3MF}`);

  rmSync(STAGING_DIR, { recursive: true, force: true });
  mkdirSync(STAGING_DIR, { recursive: true });

  // Extract only Metadata/top_*.png (flat, junked paths).
  execFileSync(
    "unzip",
    ["-o", "-j", SOURCE_3MF, "Metadata/top_*.png", "-d", STAGING_DIR],
    { stdio: "inherit" },
  );

  const pngs = readdirSync(STAGING_DIR)
    .filter((f) => /^top_\d+\.png$/.test(f))
    .sort((a, b) => numOf(a) - numOf(b));

  if (pngs.length !== EXPECTED_COUNT) {
    throw new Error(`Expected ${EXPECTED_COUNT} top_N.png renders, got ${pngs.length}.`);
  }
  if (KEYCAP_ICONS.length !== EXPECTED_COUNT) {
    throw new Error(`Catalog has ${KEYCAP_ICONS.length} entries, expected ${EXPECTED_COUNT}.`);
  }

  // Plate order (sorted top_N ascending) is 1:1 with catalog order (approved).
  for (let i = 0; i < EXPECTED_COUNT; i++) {
    const png = pngs[i];
    const icon = KEYCAP_ICONS[i];
    const srcPath = path.join(STAGING_DIR, png);
    const outPath = path.join(OUT_DIR, `${icon.id}.webp`);
    const r = await cropIconToWebp(srcPath, outPath);
    console.info(
      `[regen] ${png.padEnd(11)} → ${icon.id}.webp  content ${r.contentW}×${r.contentH} ` +
        `→ frame ${r.width}×${r.height}`,
    );
  }

  rmSync(STAGING_DIR, { recursive: true, force: true });
  console.info(`[regen] done — ${EXPECTED_COUNT} icons overwritten in ${OUT_DIR}`);
}

function numOf(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
