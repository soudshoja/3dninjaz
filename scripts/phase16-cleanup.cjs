/**
 * Phase 16-07 — Legacy column cleanup migration.
 *
 * Run AFTER verifying:
 *   SELECT COUNT(*) FROM product_variants WHERE option1_value_id IS NULL;  → must be 0
 *   SELECT COUNT(*) FROM order_items WHERE variant_label IS NULL AND ...;   → must be 0
 *
 * What this does:
 *   1. Drops `size` column from `product_variants` (enum no longer needed post-backfill)
 *   2. Does NOT touch `order_items.size` — kept for historical order rendering fallback
 *
 * Idempotent: checks column existence before each ALTER.
 *
 * Usage (from project root, with live DB creds in .env.local):
 *   node scripts/phase16-cleanup.cjs
 *
 * SAFETY: never run against live DB without completing the verification checks above.
 */

"use strict";

const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Load env
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found");
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------
function parseDbUrl(url) {
  // mysql://user:pass@host:port/dbname
  const m = url.match(/mysql:\/\/([^:]+):([^@]*)@([^:/]+):?(\d*)\/(.+)/);
  if (!m) throw new Error("Cannot parse DATABASE_URL: " + url);
  return {
    host: m[3],
    port: m[4] ? parseInt(m[4]) : 3306,
    user: m[1],
    password: decodeURIComponent(m[2]),
    database: m[5].split("?")[0],
    ssl: { rejectUnauthorized: false },
  };
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const conn = await mysql.createConnection(parseDbUrl(dbUrl));
  console.log("Connected to DB.");

  try {
    // ---------------------------------------------------------------------------
    // Safety checks
    // ---------------------------------------------------------------------------
    const [nullOpts] = await conn.execute(
      "SELECT COUNT(*) AS cnt FROM product_variants WHERE option1_value_id IS NULL"
    );
    const nullCount = nullOpts[0].cnt;
    if (nullCount > 0) {
      console.error(`\n❌ SAFETY CHECK FAILED: ${nullCount} product_variants rows still have option1_value_id IS NULL.`);
      console.error("Run the backfill script (scripts/phase16-backfill.cjs) first to assign all variants to options.");
      console.error("Aborting cleanup — no changes made.");
      process.exit(1);
    }
    console.log("✓ Safety check passed: all product_variants have option1_value_id set.");

    // ---------------------------------------------------------------------------
    // Drop size from product_variants
    // ---------------------------------------------------------------------------
    const sizeExists = await columnExists(conn, "product_variants", "size");
    if (sizeExists) {
      await conn.execute("ALTER TABLE product_variants DROP COLUMN size");
      console.log("✓ Dropped product_variants.size");
    } else {
      console.log("• product_variants.size already absent — skipping.");
    }

    // ---------------------------------------------------------------------------
    // Confirm order_items.size is preserved
    // ---------------------------------------------------------------------------
    const orderSizeExists = await columnExists(conn, "order_items", "size");
    if (orderSizeExists) {
      console.log("✓ order_items.size preserved (historical orders need it).");
    } else {
      console.warn("⚠  order_items.size column not found — historical orders may not render size fallback.");
    }

    // ---------------------------------------------------------------------------
    // Smoke check
    // ---------------------------------------------------------------------------
    const [variantCount] = await conn.execute("SELECT COUNT(*) AS cnt FROM product_variants");
    const [optionCount] = await conn.execute("SELECT COUNT(*) AS cnt FROM product_options");
    console.log(`\nSmoke checks:`);
    console.log(`  product_variants:  ${variantCount[0].cnt} rows`);
    console.log(`  product_options:   ${optionCount[0].cnt} rows`);

    console.log("\n✅ Phase 16-07 cleanup complete.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message || err);
  process.exit(1);
});
