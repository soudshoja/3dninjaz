/* eslint-disable no-console */
/**
 * Bug 3 — hide_base_price column migration.
 *
 * Idempotent: re-running on a migrated DB is a no-op (gated by
 * INFORMATION_SCHEMA existence check).
 *
 * Applies one mutation:
 *   products.hide_base_price  BOOLEAN NOT NULL DEFAULT 0  AFTER shipping_weight_kg
 *
 * Run: node scripts/phase-hide-base-price-migrate.cjs
 *   or: dotenv -e .env.local -- node scripts/phase-hide-base-price-migrate.cjs
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

async function columnExists(conn, table, column) {
  const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column],
  );
  return rows.length > 0;
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    // products.hide_base_price — BOOLEAN NOT NULL DEFAULT 0
    if (await columnExists(conn, "products", "hide_base_price")) {
      console.log("✓ products.hide_base_price already exists — skipping");
    } else {
      await conn.query(
        `ALTER TABLE products
         ADD COLUMN hide_base_price BOOLEAN NOT NULL DEFAULT 0 AFTER shipping_weight_kg`,
      );
      console.log("✓ Added products.hide_base_price");
    }

    console.log("Migration complete.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
