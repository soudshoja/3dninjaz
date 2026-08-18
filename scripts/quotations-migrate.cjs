/* eslint-disable no-console */
/**
 * Quotation system (2026-08-18) — raw-SQL DDL applicator.
 *
 * Creates two tables:
 *   quotations       — the document: client block, body, money, lifecycle
 *   quotation_items  — the "Package Inclusion" lines
 *
 * Touches NOTHING else. `orders` and `order_items` are deliberately unchanged:
 * a paid quotation creates a normal order and the existing invoice pipeline
 * runs as it does today. See .planning/QUOTATION-SYSTEM-PLAN.md.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS, plus an INFORMATION_SCHEMA check
 * before seeding the number series, so re-running changes nothing and exits 0.
 *
 * Schema name comes from `SELECT DATABASE()`, never from process.env.DB_NAME —
 * prod's .env.local carried a stale DB_NAME pointing at the DEV database, which
 * silently skipped a migration in Aug 2026 (see PR #207).
 *
 * Run: node scripts/quotations-migrate.cjs
 *   (reads .env.local automatically)
 *
 * NB: do NOT run drizzle-kit push against the cPanel remote — it hangs.
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

/** First quote number the system will issue. Current manual series ended #0023. */
const SERIES_START = 24;

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

async function tableExists(conn, dbName, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table],
  );
  return rows.length > 0;
}

async function run() {
  loadEnv();

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[quotations] DATABASE_URL not set");

  const conn = await mysql.createConnection(url);

  const [dbRows] = await conn.query("SELECT DATABASE() AS db");
  const dbName = dbRows[0] && dbRows[0].db;
  if (!dbName) throw new Error("[quotations] connection has no database selected");
  console.log(`[quotations] connected to ${dbName}`);

  try {
    const hadQuotations = await tableExists(conn, dbName, "quotations");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`quotations\` (
        \`id\`                   CHAR(36)      NOT NULL,
        \`quote_no\`             INT           NOT NULL AUTO_INCREMENT,
        \`status\`               ENUM('draft','sent','deposit_paid','completed','cancelled')
                                               NOT NULL DEFAULT 'draft',
        \`contact_name\`         VARCHAR(200)  NOT NULL,
        \`company_name\`         VARCHAR(200)  NULL,
        \`contact_email\`        VARCHAR(255)  NULL,
        \`contact_phone\`        VARCHAR(32)   NULL,
        \`contact_address\`      TEXT          NULL,
        \`user_id\`              VARCHAR(36)   NULL,
        \`project_description\`  TEXT          NULL,
        \`production_lead_time\` VARCHAR(120)  NULL,
        \`valid_until\`          VARCHAR(10)   NOT NULL,
        \`terms\`                LONGTEXT      NULL,
        \`subtotal\`             DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`total_amount\`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`currency\`             VARCHAR(3)    NOT NULL DEFAULT 'MYR',
        \`deposit_percent\`      DECIMAL(5,2)  NOT NULL DEFAULT 50.00,
        \`deposit_amount\`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`sent_at\`              TIMESTAMP     NULL DEFAULT NULL,
        \`deposit_paid_at\`      TIMESTAMP     NULL DEFAULT NULL,
        \`completed_at\`         TIMESTAMP     NULL DEFAULT NULL,
        \`order_id\`             CHAR(36)      NULL DEFAULT NULL,
        \`notes\`                TEXT          NULL,
        \`created_at\`           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                               ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_quotations_quote_no\` (\`quote_no\`),
        UNIQUE KEY \`uq_quotations_order_id\` (\`order_id\`),
        KEY \`idx_quotations_status_created\` (\`status\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(
      hadQuotations
        ? "[quotations] ⊘ quotations already existed — skipped"
        : "[quotations] ✓ quotations created",
    );

    // Seed the number series only on first creation, so a re-run can never
    // rewind AUTO_INCREMENT under existing rows.
    if (!hadQuotations) {
      await conn.query(`ALTER TABLE \`quotations\` AUTO_INCREMENT = ${SERIES_START}`);
      console.log(`[quotations] ✓ number series starts at #${SERIES_START}`);
    }

    const hadItems = await tableExists(conn, dbName, "quotation_items");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`quotation_items\` (
        \`id\`           CHAR(36)      NOT NULL,
        \`quotation_id\` CHAR(36)      NOT NULL,
        \`position\`     INT           NOT NULL DEFAULT 0,
        \`description\`  VARCHAR(500)  NOT NULL,
        \`quantity\`     INT           NOT NULL DEFAULT 1,
        \`unit_price\`   DECIMAL(10,2) NOT NULL,
        \`line_total\`   DECIMAL(10,2) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_qi_quotation\` (\`quotation_id\`, \`position\`),
        CONSTRAINT \`fk_qi_quotation\` FOREIGN KEY (\`quotation_id\`)
          REFERENCES \`quotations\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(
      hadItems
        ? "[quotations] ⊘ quotation_items already existed — skipped"
        : "[quotations] ✓ quotation_items created",
    );

    for (const t of ["quotations", "quotation_items"]) {
      console.log(`\n[quotations] --- SHOW CREATE TABLE ${t} ---`);
      const [rows] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
      console.log(rows[0]["Create Table"]);
    }

    const [counts] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM quotations)      AS quotes,
         (SELECT COUNT(*) FROM quotation_items) AS items,
         (SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'quotations') AS nextNo`,
      [dbName],
    );
    console.log(
      `\n[quotations] OK — db=${dbName} quotes=${counts[0].quotes} items=${counts[0].items} nextQuoteNo=#${counts[0].nextNo}`,
    );
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[quotations] FATAL:", err.message || err);
  process.exit(1);
});
