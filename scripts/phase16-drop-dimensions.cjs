/**
 * phase16-drop-dimensions.cjs
 *
 * Drops width_cm, height_cm, depth_cm from product_variants (Phase 16-07).
 * Idempotent — checks information_schema.COLUMNS before each ALTER so it is
 * safe to run multiple times.
 *
 * Usage:
 *   node scripts/phase16-drop-dimensions.cjs
 *
 * Requires DATABASE_URL in environment (same as the app).
 */

"use strict";

const mysql = require("mysql2/promise");
require("dotenv").config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?
       AND COLUMN_NAME  = ?
     LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function dropIfExists(conn, table, column) {
  if (await columnExists(conn, table, column)) {
    console.log(`  DROP COLUMN ${table}.${column}`);
    await conn.execute(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
  } else {
    console.log(`  SKIP — ${table}.${column} already absent`);
  }
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  try {
    console.log("phase16-drop-dimensions: removing dimension columns from product_variants");
    await dropIfExists(conn, "product_variants", "width_cm");
    await dropIfExists(conn, "product_variants", "height_cm");
    await dropIfExists(conn, "product_variants", "depth_cm");
    console.log("Done.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
