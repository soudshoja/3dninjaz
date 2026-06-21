/**
 * Add accounting tables: expenses, assets, payouts.
 *
 * Raw-DDL migration (per CLAUDE.md: do NOT run drizzle-kit push against remote).
 * Idempotent — CREATE TABLE IF NOT EXISTS + a 3-table existence gate, so a
 * re-run is a no-op. DDL matches the Drizzle schema in src/lib/db/schema.ts.
 *
 * Run dev:  ssh -L 3307 tunnel up, DATABASE_URL -> 127.0.0.1:3307, then
 *           npx tsx --env-file=.env.local scripts/migrate-accounting-tables.ts
 * Run prod: on the box in the app dir (or via tunnel to ninjaz_3dnp):
 *           DATABASE_URL=<prod> npx tsx scripts/migrate-accounting-tables.ts
 *
 * Rollback (tables are empty until used): DROP TABLE expenses, assets, payouts;
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "");

  const [existing] = await conn.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('expenses','assets','payouts')",
    [dbName],
  );
  if ((existing as unknown[]).length === 3) {
    console.info("[migrate-accounting] all 3 tables already exist — no-op");
    await conn.end();
    return;
  }

  await conn.query(`CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    expense_date VARCHAR(10) NOT NULL,
    category ENUM('materials','utilities','marketing','shipping','equipment','other') NOT NULL,
    note VARCHAR(500),
    amount DECIMAL(10,2) NOT NULL,
    paid_from ENUM('paypal','bank','cash') NOT NULL DEFAULT 'bank',
    supplier_name VARCHAR(200),
    source_doc_url VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_expenses_date (expense_date),
    KEY idx_expenses_category (category)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.query(`CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    asset_date VARCHAR(10) NOT NULL,
    name VARCHAR(200) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    note VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_assets_date (asset_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.query(`CREATE TABLE IF NOT EXISTS payouts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    payout_date VARCHAR(10) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    paid_into ENUM('bank','cash') NOT NULL DEFAULT 'bank',
    note VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_payouts_date (payout_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [verify] = await conn.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('expenses','assets','payouts')",
    [dbName],
  );
  console.info(
    "[migrate-accounting] done — accounting tables present:",
    (verify as Array<{ TABLE_NAME: string }>).map((r) => r.TABLE_NAME).join(", "),
  );
  await conn.end();
}

main().catch((e) => {
  console.error("[migrate-accounting] failed:", e);
  process.exit(1);
});
