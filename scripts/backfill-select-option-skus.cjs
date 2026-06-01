/**
 * scripts/backfill-select-option-skus.cjs
 *
 * Idempotent backfill: for every Select config field whose options have an
 * empty `sku`, auto-generate one using the same pattern as the live UI
 * (generateVariantSku). Skips options that already have a sku value.
 *
 * Usage:
 *   node scripts/backfill-select-option-skus.cjs          # dry-run (safe)
 *   APPLY=1 node scripts/backfill-select-option-skus.cjs  # write to DB
 *
 * Requires: DATABASE_URL in .env.local (or environment).
 * Dependency: mysql2 (already in project node_modules).
 */

"use strict";

const path = require("path");
const fs = require("fs");
const mysql2 = require("mysql2/promise");

// ---------------------------------------------------------------------------
// Load .env.local so the script works without exporting env vars manually.
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ---------------------------------------------------------------------------
// Inline copy of generateVariantSku from src/lib/sku.ts
// (avoids transpiling TS in a one-off CJS script).
//
// Pattern: 3DN-{SLUG4}-{INITIALS}
//   SLUG4    = first 4 alphanumeric chars of productSlug, uppercased
//   INITIALS = first char of each option label, uppercased, no dashes
// ---------------------------------------------------------------------------
function generateVariantSku(productSlug, optionValueLabels) {
  const slugPart = productSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  const initials = optionValueLabels
    .filter((v) => typeof v === "string" && v.trim() !== "")
    .map((v) => {
      const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return cleaned.slice(0, 1);
    })
    .join("");
  return initials ? `3DN-${slugPart}-${initials}` : `3DN-${slugPart}`;
}

// ---------------------------------------------------------------------------
// Parse DATABASE_URL: mysql://user:pass@host:port/db
// ---------------------------------------------------------------------------
function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306", 10),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const apply = process.env.APPLY === "1";
  console.log(`\n[backfill-select-option-skus] mode: ${apply ? "APPLY (writes to DB)" : "DRY-RUN (no writes)"}\n`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL is not set. Add it to .env.local or export it.");
    process.exit(1);
  }

  const conn = await mysql2.createConnection(parseDbUrl(dbUrl));

  try {
    // Fetch all select config fields joined to product slug.
    const [rows] = await conn.query(
      `SELECT
         pcf.id        AS fieldId,
         pcf.label     AS fieldLabel,
         pcf.configJson,
         p.id          AS productId,
         p.slug        AS productSlug
       FROM product_config_fields pcf
       JOIN products p ON pcf.productId = p.id
       WHERE pcf.fieldType = 'select'`
    );

    let totalFields = 0;
    let totalOptionsPatched = 0;
    let totalProductsUpdated = 0;

    for (const row of rows) {
      totalFields++;

      let cfg;
      try {
        cfg = JSON.parse(row.configJson);
      } catch {
        console.warn(`  [SKIP] field ${row.fieldId} (${row.fieldLabel}): invalid JSON`);
        continue;
      }

      const options = Array.isArray(cfg.options) ? cfg.options : [];
      let changed = false;

      const updatedOptions = options.map((opt) => {
        if (opt.sku) return opt; // already has a sku — never overwrite
        const label = opt.label ?? "";
        if (!label.trim()) return opt; // empty label — skip
        const generated = generateVariantSku(row.productSlug, [label]);
        console.log(
          `  ${apply ? "PATCH" : "WOULD PATCH"} | product: ${row.productSlug} | field: ${row.fieldLabel} | option: "${label}" | sku: ${generated}`
        );
        changed = true;
        totalOptionsPatched++;
        return { ...opt, sku: generated };
      });

      if (!changed) continue;

      totalProductsUpdated++;
      const newConfigJson = JSON.stringify({ ...cfg, options: updatedOptions });

      if (apply) {
        await conn.query(
          "UPDATE product_config_fields SET configJson = ? WHERE id = ?",
          [newConfigJson, row.fieldId]
        );
        console.log(`  → Updated field ${row.fieldId} in DB.`);
      } else {
        console.log(`  → (dry-run) Would update field ${row.fieldId}.`);
      }
    }

    console.log(`
Summary:
  Select fields scanned : ${totalFields}
  Fields with changes   : ${totalProductsUpdated}
  Options patched       : ${totalOptionsPatched}
  Mode                  : ${apply ? "APPLIED" : "DRY-RUN (re-run with APPLY=1 to write)"}
`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[backfill-select-option-skus] fatal:", err.message);
  process.exit(1);
});
