/**
 * Phase 25-02 — One-off dev-machine keycap icon extraction (D-07).
 *
 * Extracts all 34 top-down keycap renders (`Metadata/top_N.png`, 512×512 RGBA,
 * isolated orthographic view) from a Bambu Studio 3mf archive, converts each to
 * a compressed WebP, and emits a browsable contact sheet so a human can verify
 * the plate→catalog id mapping before the final rename (Task 3).
 *
 * IMPORTANT design constraints (see 25-RESEARCH.md Pattern 5 + anti-patterns):
 *  - Source is `top_N.png`, NOT `plate_N.png` (plate_N includes the build-plate
 *    bed + wipe tower — wrong source).
 *  - Node has NO built-in ZIP reader. We shell out to the installed Info-ZIP
 *    `unzip` (Git Bash 6.00). Do NOT add an npm zip dependency (adm-zip /
 *    unzipper are forbidden anti-patterns).
 *  - `sharp` is already a project dependency (Phase 7 image pipeline).
 *  - Renders are NOT renamed to catalog ids here — the plate→catalog mapping is
 *    unconfirmed until the human-verify checkpoint (Task 2). This script only
 *    produces `top_<N>.webp` staging files + the contact sheet.
 *
 * Run (Git Bash):
 *   npx tsx scripts/extract-keycap-icons.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PROJECT_ROOT = path.join(__dirname, "..");
const STAGING_DIR = path.join(PROJECT_ROOT, "public", "icons", "keycaps", "_staging");
const SOURCE_3MF = "D:/Downloads/M batch3 keycaps p2s.3mf";
// Cross-check source only (same 34-design set — do NOT treat as 68). Not extracted.
const CROSSCHECK_3MF = "D:/Downloads/M batch3 keycaps a1.3mf";
const EXPECTED_COUNT = 34;

async function main() {
  if (!existsSync(SOURCE_3MF)) {
    throw new Error(`Source 3mf not found: ${SOURCE_3MF}`);
  }
  console.info(`[extract] source:      ${SOURCE_3MF}`);
  console.info(`[extract] cross-check: ${CROSSCHECK_3MF} (not extracted — same 34-design set)`);

  // Fresh staging dir every run (idempotent).
  rmSync(STAGING_DIR, { recursive: true, force: true });
  mkdirSync(STAGING_DIR, { recursive: true });

  // 1. Extract ONLY Metadata/top_*.png via Info-ZIP unzip (no npm zip dep).
  //    -j junks paths so files land flat in the staging dir.
  console.info(`[extract] unzipping Metadata/top_*.png → ${STAGING_DIR}`);
  execFileSync(
    "unzip",
    ["-o", "-j", SOURCE_3MF, "Metadata/top_*.png", "-d", STAGING_DIR],
    { stdio: "inherit" },
  );

  const pngs = readdirSync(STAGING_DIR)
    .filter((f) => /^top_\d+\.png$/.test(f))
    .sort((a, b) => numOf(a) - numOf(b));

  if (pngs.length !== EXPECTED_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_COUNT} top_N.png renders, got ${pngs.length}. ` +
        `Aborting (wrong archive or partial extraction).`,
    );
  }

  // 2. Convert each top_N.png → top_<N>.webp, logging source metadata (proves
  //    the 512×512 RGBA top_N source was used, NOT plate_N).
  const webpNames: string[] = [];
  for (const png of pngs) {
    const n = numOf(png);
    const srcPath = path.join(STAGING_DIR, png);
    const meta = await sharp(srcPath).metadata();
    console.info(
      `[extract] top_${n}.png  ${meta.width}×${meta.height} ${meta.format} ` +
        `${meta.hasAlpha ? "RGBA" : "no-alpha"}`,
    );
    if (meta.width !== 512 || meta.height !== 512) {
      console.warn(
        `[extract] WARNING: top_${n}.png is ${meta.width}×${meta.height}, expected 512×512`,
      );
    }
    const outName = `top_${n}.webp`;
    await sharp(srcPath).webp({ quality: 82 }).toFile(path.join(STAGING_DIR, outName));
    webpNames.push(outName);
  }

  webpNames.sort((a, b) => numOf(a) - numOf(b));

  if (webpNames.length !== EXPECTED_COUNT) {
    throw new Error(`Produced ${webpNames.length} WebP renders, expected ${EXPECTED_COUNT}.`);
  }

  // 3. Emit a labelled contact sheet for human plate→catalog verification.
  const cells = webpNames
    .map((name) => {
      const n = numOf(name);
      return `    <figure>
      <img src="${name}" alt="top_${n}" width="160" height="160" loading="lazy" />
      <figcaption>top_${n}</figcaption>
    </figure>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Keycap icon contact sheet — ${EXPECTED_COUNT} renders</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #0b1020; color: #f7faf4; }
    h1 { font-size: 18px; }
    p { color: #b9c2d0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
    figure { margin: 0; background: #151b2e; border: 1px solid #2a3350; border-radius: 10px; padding: 12px; text-align: center; }
    /* Checkerboard so transparent PNG/WebP alpha is obvious */
    img { background-image: linear-gradient(45deg,#3a4160 25%,transparent 25%),linear-gradient(-45deg,#3a4160 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3a4160 75%),linear-gradient(-45deg,transparent 75%,#3a4160 75%); background-size: 16px 16px; background-position: 0 0,0 8px,8px -8px,-8px 0; border-radius: 6px; }
    figcaption { margin-top: 8px; font-weight: 700; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Keycap icon contact sheet — ${EXPECTED_COUNT} renders (top_N)</h1>
  <p>Match each numbered render to a label in the 34-icon catalog. Source: <code>${path.basename(SOURCE_3MF)}</code>. Do NOT commit these staging files — they are renamed to catalog ids in Task 3.</p>
  <div class="grid">
${cells}
  </div>
</body>
</html>
`;

  writeFileSync(path.join(STAGING_DIR, "_contact-sheet.html"), html, "utf8");

  console.info(
    `[extract] done — ${webpNames.length} staged WebP renders + contact sheet at ` +
      `${path.join(STAGING_DIR, "_contact-sheet.html")}`,
  );
}

function numOf(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
