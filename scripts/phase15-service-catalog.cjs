/* eslint-disable no-console */
/**
 * Phase 15 — shipping_service_catalog table migration.
 *
 * Stores Delyva courier service tiers discovered by the multi-corridor probe
 * so the admin can toggle each on/off without re-probing on every page load.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS; no ALTER needed.
 * Run AFTER backing up the database.
 *
 * Usage:
 *   node scripts/phase15-service-catalog.cjs
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

async function tableExists(conn, dbName, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table],
  );
  return rows.length > 0;
}

async function createServiceCatalog(conn, dbName) {
  if (await tableExists(conn, dbName, "shipping_service_catalog")) {
    console.log("skip table shipping_service_catalog (already exists)");
    return false;
  }
  await conn.query(`
    CREATE TABLE \`shipping_service_catalog\` (
      \`id\`           VARCHAR(36)   NOT NULL,
      \`service_code\` VARCHAR(100)  NOT NULL,
      \`company_code\` VARCHAR(50)   NOT NULL DEFAULT '',
      \`company_name\` VARCHAR(120)  NOT NULL DEFAULT '',
      \`service_name\` VARCHAR(120)  NULL,
      \`service_type\` VARCHAR(20)   NULL,
      \`sample_price\` DECIMAL(10,2) NULL,
      \`eta_min_minutes\` INT        NULL,
      \`eta_max_minutes\` INT        NULL,
      \`is_enabled\`   TINYINT(1)   NOT NULL DEFAULT 1,
      \`last_seen_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`created_at\`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_catalog_service_code\` (\`service_code\`),
      KEY \`idx_catalog_company\` (\`company_code\`),
      KEY \`idx_catalog_enabled\` (\`is_enabled\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("applied table shipping_service_catalog");
  return true;
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing in .env.local");
  const conn = await mysql.createConnection(url);
  const dbName =
    process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`Connected to ${dbName}`);
  try {
    await createServiceCatalog(conn, dbName);
    const [[{ c }]] = await conn.query(
      `SELECT COUNT(*) AS c FROM shipping_service_catalog`,
    );
    console.log(`verify: shipping_service_catalog rows=${c}`);
    console.log("phase15-service-catalog migration complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
