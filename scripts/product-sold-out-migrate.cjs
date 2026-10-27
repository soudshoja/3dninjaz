/* eslint-disable no-console */
/**
 * products.sold_out — manual product-level sold-out override.
 *
 * Idempotent: the ALTER is gated by an INFORMATION_SCHEMA check keyed off the
 * LIVE `SELECT DATABASE()` (never DB_NAME — see "Migration DB_NAME trap": prod's
 * .env.local carries DB_NAME=ninjaz_3dn, the DEV schema).
 *
 * Does NOT use drizzle-kit push (hangs against the remote).
 *
 * Run (dev):
 *   node scripts/product-sold-out-migrate.cjs --dry-run
 *   node scripts/product-sold-out-migrate.cjs --expect-db=ninjaz_3dn
 * Run (prod, human-approved step):
 *   node scripts/product-sold-out-migrate.cjs --expect-db=ninjaz_3dnp
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = { dryRun: false, expectDb: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--expect-db=")) args.expectDb = arg.slice("--expect-db=".length);
  }
  return args;
}

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

async function columnExists(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tableName, columnName],
  );
  return rows.length > 0;
}

const DDL =
  "ALTER TABLE `products` ADD COLUMN `sold_out` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_featured`";

async function run() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[sold-out-migrate] DATABASE_URL not set");

  const conn = await mysql.createConnection(url);
  try {
    const [dbRows] = await conn.query("SELECT DATABASE() AS db");
    const dbName = dbRows[0].db;
    console.log(`[sold-out-migrate] connected to ${dbName}`);

    if (process.env.DB_NAME && process.env.DB_NAME !== dbName) {
      console.warn(
        `[sold-out-migrate] WARNING: DB_NAME=${process.env.DB_NAME} but connected to ${dbName} — ignoring DB_NAME`,
      );
    }
    if (args.expectDb && args.expectDb !== dbName) {
      console.error(
        `[sold-out-migrate] FATAL: --expect-db=${args.expectDb} but connected to ${dbName}. Aborting.`,
      );
      process.exitCode = 1;
      return;
    }

    if (args.dryRun) {
      console.log(`[sold-out-migrate] --dry-run: would run: ${DDL}`);
      return;
    }

    if (await columnExists(conn, dbName, "products", "sold_out")) {
      console.log("[sold-out-migrate] products.sold_out already exists — nothing to do");
    } else {
      await conn.query(DDL);
      console.log("[sold-out-migrate] added products.sold_out");
    }

    if (!(await columnExists(conn, dbName, "products", "sold_out"))) {
      console.error("[sold-out-migrate] FATAL: products.sold_out missing after migration");
      process.exitCode = 1;
    }
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[sold-out-migrate] failed:", err);
  process.exit(1);
});
