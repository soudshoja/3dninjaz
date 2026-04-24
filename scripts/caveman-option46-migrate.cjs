/* eslint-disable no-console */
/**
 * Caveman session — raise variant option cap from 3 → 6.
 *
 * Adds three nullable FK-style VARCHAR columns to product_variants:
 *   option4_value_id VARCHAR(36) NULL AFTER option3_value_id
 *   option5_value_id VARCHAR(36) NULL AFTER option4_value_id
 *   option6_value_id VARCHAR(36) NULL AFTER option5_value_id
 *
 * Idempotent — safe to re-run. Existing rows are unaffected (all default NULL).
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
    console.log(`  ${tableName}.${columnName}  -> exists, skipping`);
    return;
  }
  await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`  ${tableName}.${columnName}  -> added`);
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
      conn, dbName, "product_variants", "option4_value_id",
      "`option4_value_id` VARCHAR(36) NULL AFTER `option3_value_id`",
    );
    await addColumnIfMissing(
      conn, dbName, "product_variants", "option5_value_id",
      "`option5_value_id` VARCHAR(36) NULL AFTER `option4_value_id`",
    );
    await addColumnIfMissing(
      conn, dbName, "product_variants", "option6_value_id",
      "`option6_value_id` VARCHAR(36) NULL AFTER `option5_value_id`",
    );

    // Verify all three exist
    const missing = [];
    for (const col of ["option4_value_id", "option5_value_id", "option6_value_id"]) {
      const ok = await columnExists(conn, dbName, "product_variants", col);
      if (!ok) missing.push(col);
    }
    if (missing.length > 0) {
      console.error(`MISSING columns: ${missing.join(", ")}`);
      process.exit(1);
    }

    // Smoke check
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS c FROM product_variants`,
    );
    console.log(`product_variants total rows: ${rows[0].c}`);
    console.log("OK: option4/5/6_value_id columns present");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
