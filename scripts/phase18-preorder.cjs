/* eslint-disable no-console */
/**
 * Phase 18 — add allow_preorder flag to product_variants.
 *
 * When a variant is tracked AND stock=0 AND allow_preorder=FALSE, the PDP hides
 * it. When allow_preorder=TRUE, the variant is shown with a "Pre-order" badge
 * and the add-to-bag button label becomes "Pre-order".
 *
 * Idempotent — re-run safe.
 *
 * Columns added to product_variants:
 *   allow_preorder TINYINT(1) NOT NULL DEFAULT 0 AFTER `weight_g`
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
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

async function columnExists(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tableName, columnName],
  );
  return rows.length > 0;
}

async function addColumnIfMissing(conn, dbName, tableName, columnName, ddl) {
  const exists = await columnExists(conn, dbName, tableName, columnName);
  if (exists) {
    console.log(`${tableName}.${columnName}  -> exists, skipping`);
    return;
  }
  await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`${tableName}.${columnName}  -> added`);
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName =
    process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`Connected to ${dbName}`);

  try {
    await addColumnIfMissing(
      conn, dbName, "product_variants", "allow_preorder",
      "`allow_preorder` TINYINT(1) NOT NULL DEFAULT 0 AFTER `weight_g`",
    );

    const ok = await columnExists(conn, dbName, "product_variants", "allow_preorder");
    if (!ok) {
      console.error(`MISSING product_variants.allow_preorder`);
      process.exit(1);
    }

    // Smoke check
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS c FROM product_variants WHERE allow_preorder = 0`,
    );
    console.log(`Variants with allow_preorder=0: ${countRows[0].c}`);

    console.log("OK: Phase 18 schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
