/* eslint-disable no-console */
/**
 * Phase 17 raw-SQL migration — sale pricing + default flag + per-variant weight.
 *
 * Idempotent: each ALTER TABLE ADD COLUMN checks INFORMATION_SCHEMA first.
 * Safe to re-run.
 *
 * Columns added to product_variants:
 *   sale_price   DECIMAL(10,2) NULL        AFTER `price`
 *   sale_from    TIMESTAMP NULL            AFTER `sale_price`
 *   sale_to      TIMESTAMP NULL            AFTER `sale_from`
 *   is_default   TINYINT(1) NOT NULL DEFAULT 0  AFTER `position`
 *   weight_g     INT NULL                  AFTER `is_default`  (AD-08 per-variant Delyva weight)
 *
 * Deploy runbook (Haiku):
 *   node scripts/phase17-migrate.cjs
 *   mysql ... -e "DESCRIBE product_variants" | grep -E "sale_|is_default|weight_g"
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
    // ------------------------------------------------------------------ //
    // product_variants — Phase 17 new columns
    // ------------------------------------------------------------------ //

    // sale_price: optional lower price. Effective price = salePrice ?? price
    // when the sale window is active.
    await addColumnIfMissing(
      conn, dbName, "product_variants", "sale_price",
      "`sale_price` DECIMAL(10,2) NULL AFTER `price`",
    );

    // sale_from: UTC TIMESTAMP start bound. NULL = no start bound.
    await addColumnIfMissing(
      conn, dbName, "product_variants", "sale_from",
      "`sale_from` TIMESTAMP NULL AFTER `sale_price`",
    );

    // sale_to: UTC TIMESTAMP end bound. NULL = no end bound.
    await addColumnIfMissing(
      conn, dbName, "product_variants", "sale_to",
      "`sale_to` TIMESTAMP NULL AFTER `sale_from`",
    );

    // is_default: admin-marked default variant combo; app-layer single-default
    // invariant enforced via setDefaultVariant transaction (MariaDB has no
    // partial unique index).
    await addColumnIfMissing(
      conn, dbName, "product_variants", "is_default",
      "`is_default` TINYINT(1) NOT NULL DEFAULT 0 AFTER `position`",
    );

    // weight_g (AD-08): per-variant Delyva shipping weight override in grams.
    // NULL = inherit products.shippingWeightKg × 1000; if that is also NULL,
    // quoteForCart falls back to defaultWeightKg and emits a warn log.
    await addColumnIfMissing(
      conn, dbName, "product_variants", "weight_g",
      "`weight_g` INT NULL AFTER `is_default`",
    );

    // ------------------------------------------------------------------ //
    // Smoke checks
    // ------------------------------------------------------------------ //
    const expectedNewCols = ["sale_price", "sale_from", "sale_to", "is_default", "weight_g"];
    for (const col of expectedNewCols) {
      const ok = await columnExists(conn, dbName, "product_variants", col);
      if (!ok) {
        console.error(`MISSING product_variants.${col}`);
        process.exit(1);
      }
    }

    console.log("OK: all Phase 17 schema changes applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
