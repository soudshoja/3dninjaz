/* eslint-disable no-console */
/**
 * Phase 7 (07-01) raw SQL migration — fallback path when drizzle-kit push
 * hangs against the cPanel MariaDB host (Phase 3 + Phase 6 precedent).
 *
 * Idempotent: every CREATE uses IF NOT EXISTS; every ALTER checks
 * INFORMATION_SCHEMA.COLUMNS before adding. Safe to re-run.
 *
 * Implements:
 *   - 9 ALTER TABLE orders ADD COLUMN ... (manual orders + refund tracking +
 *     PayPal financials mirror)
 *   - 3 CREATE TABLE: payment_links, dispute_cache, recon_runs
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

async function columnExists(conn, dbName, table, col) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, col],
  );
  return rows.length > 0;
}

async function tableExists(conn, dbName, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table],
  );
  return rows.length > 0;
}

async function addOrderColumns(conn, dbName) {
  // Each entry: [columnName, columnDefinition]
  // Definitions match Drizzle's schema.ts byte-for-byte (custom_images is
  // stored as LONGTEXT per MariaDB JSON quirk — CLAUDE.md).
  const cols = [
    ["source_type", "ENUM('web','manual') NOT NULL DEFAULT 'web'"],
    ["custom_item_name", "VARCHAR(200) NULL"],
    ["custom_item_description", "TEXT NULL"],
    ["custom_images", "LONGTEXT NULL"],
    ["refunded_amount", "DECIMAL(10,2) NOT NULL DEFAULT '0.00'"],
    ["paypal_fee", "DECIMAL(10,2) NULL"],
    ["paypal_net", "DECIMAL(10,2) NULL"],
    ["seller_protection", "VARCHAR(32) NULL"],
    ["paypal_settle_date", "TIMESTAMP NULL"],
  ];
  for (const [col, def] of cols) {
    if (await columnExists(conn, dbName, "orders", col)) {
      console.log(`skip orders.${col}`);
      continue;
    }
    await conn.query(`ALTER TABLE \`orders\` ADD COLUMN \`${col}\` ${def}`);
    console.log(`applied orders.${col}`);
  }
}

async function createPaymentLinks(conn, dbName) {
  if (await tableExists(conn, dbName, "payment_links")) {
    console.log("skip table payment_links");
    return;
  }
  await conn.query(`
    CREATE TABLE \`payment_links\` (
      \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
      \`order_id\` VARCHAR(36) NOT NULL,
      \`token\` VARCHAR(64) NOT NULL,
      \`expires_at\` TIMESTAMP NOT NULL,
      \`used_at\` TIMESTAMP NULL,
      \`created_by\` VARCHAR(36) NOT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`payment_links_token_unique\` (\`token\`),
      KEY \`payment_links_order_idx\` (\`order_id\`),
      CONSTRAINT \`payment_links_order_id_orders_id_fk\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`payment_links_created_by_user_id_fk\` FOREIGN KEY (\`created_by\`) REFERENCES \`user\`(\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1
  `);
  console.log("applied table payment_links");
}

async function createDisputeCache(conn, dbName) {
  if (await tableExists(conn, dbName, "dispute_cache")) {
    console.log("skip table dispute_cache");
    return;
  }
  await conn.query(`
    CREATE TABLE \`dispute_cache\` (
      \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
      \`dispute_id\` VARCHAR(64) NOT NULL,
      \`order_id\` VARCHAR(36) NULL,
      \`status\` VARCHAR(32) NOT NULL,
      \`reason\` VARCHAR(64) NULL,
      \`amount\` DECIMAL(10,2) NULL,
      \`currency\` VARCHAR(3) NULL,
      \`create_date\` TIMESTAMP NOT NULL,
      \`update_date\` TIMESTAMP NOT NULL,
      \`last_synced_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`raw_json\` MEDIUMTEXT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`dispute_cache_dispute_id_unique\` (\`dispute_id\`),
      KEY \`dispute_cache_status_idx\` (\`status\`),
      KEY \`dispute_cache_order_idx\` (\`order_id\`),
      CONSTRAINT \`dispute_cache_order_id_orders_id_fk\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1
  `);
  console.log("applied table dispute_cache");
}

async function createReconRuns(conn, dbName) {
  if (await tableExists(conn, dbName, "recon_runs")) {
    console.log("skip table recon_runs");
    return;
  }
  await conn.query(`
    CREATE TABLE \`recon_runs\` (
      \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
      \`run_date\` VARCHAR(10) NOT NULL,
      \`ran_at\` TIMESTAMP NOT NULL,
      \`total_paypal_txns\` INT NOT NULL,
      \`total_local_txns\` INT NOT NULL,
      \`drift_count\` INT NOT NULL DEFAULT 0,
      \`drift_json\` MEDIUMTEXT NULL,
      \`status\` VARCHAR(16) NOT NULL,
      \`error_message\` TEXT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`recon_runs_run_date_unique\` (\`run_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1
  `);
  console.log("applied table recon_runs");
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);

  const dbName = process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`Connected to ${dbName}`);

  try {
    await addOrderColumns(conn, dbName);
    await createPaymentLinks(conn, dbName);
    await createDisputeCache(conn, dbName);
    await createReconRuns(conn, dbName);
    console.log("phase7-migrate complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
