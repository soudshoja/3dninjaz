/**
 * scripts/strip-soft-hyphens.cjs
 *
 * Idempotent one-shot data cleaner.
 *
 * Strips invisible / problematic Unicode from the `products.description` column
 * that were inserted by AI text generators or word-processor paste:
 *   - U+00AD  SOFT HYPHEN              → removed
 *   - U+00A0  NON-BREAKING SPACE       → regular space U+0020
 *   - U+0092  Windows-1252 right quote → U+2019 RIGHT SINGLE QUOTATION MARK
 *   - U+200B  ZERO WIDTH SPACE         → removed
 *   - U+200C  ZERO WIDTH NON-JOINER    → removed
 *   - U+200D  ZERO WIDTH JOINER        → removed
 *   - U+FEFF  BOM / ZWNBSP             → removed
 *   - HTML entities: &shy; &#173; &#xAD; &#xad; → removed
 *
 * Usage (dry-run, default):
 *   node scripts/strip-soft-hyphens.cjs
 *
 * Usage (write changes):
 *   APPLY=1 node scripts/strip-soft-hyphens.cjs
 *
 * Safe to run multiple times — rows whose description is already clean are
 * detected by comparing before/after and skipped with no UPDATE issued.
 *
 * Requires DATABASE_URL in .env.local (mysql://user:pass@host:port/db).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

// ---------------------------------------------------------------------------
// Load DATABASE_URL from .env.local
// ---------------------------------------------------------------------------
const envPath = path.resolve(__dirname, "../.env.local");
if (!fs.existsSync(envPath)) {
  console.error("ERROR: .env.local not found at", envPath);
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, "utf8");
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("ERROR: DATABASE_URL not found in .env.local");
  process.exit(1);
}
const DATABASE_URL = match[1].trim();

// ---------------------------------------------------------------------------
// Normaliser — mirrors rich-text-sanitizer.ts normaliseUnicode()
// ---------------------------------------------------------------------------
function normalise(html) {
  if (typeof html !== "string") return html;
  return html
    // HTML entity soft hyphens
    .replace(/&shy;|&#173;|&#xA[Dd];/g, "")
    // U+00AD soft hyphen (may appear as literal char or UTF-8 sequence)
    .replace(/­/g, "")
    // U+00A0 non-breaking space → regular space
    .replace(/ /g, " ")
    // U+0092 Windows-1252 private-use right single quote → U+2019
    .replace(//g, "’")
    // Zero-width chars
    .replace(/[​‌‍﻿]/g, "");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const apply = process.env.APPLY === "1";
  console.log(apply ? "[APPLY mode] Changes WILL be written." : "[DRY-RUN mode] No changes written. Set APPLY=1 to write.");

  // Parse mysql:// URL
  const url = new URL(DATABASE_URL);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || "3306", 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    charset: "utf8mb4",
  });

  try {
    const [rows] = await conn.execute("SELECT id, name, description FROM products WHERE description IS NOT NULL");

    let changed = 0;
    let skipped = 0;

    for (const row of rows) {
      const original = row.description;
      const cleaned = normalise(original);

      if (cleaned === original) {
        skipped++;
        continue;
      }

      changed++;
      console.log(`  CHANGED: "${row.name}" (id=${row.id})`);

      if (apply) {
        await conn.execute("UPDATE products SET description = ? WHERE id = ?", [cleaned, row.id]);
      }
    }

    console.log(`\nSummary: ${changed} row(s) would change, ${skipped} already clean.`);
    if (!apply && changed > 0) {
      console.log("Run with APPLY=1 to apply changes.");
    } else if (apply && changed > 0) {
      console.log("All changes written.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
