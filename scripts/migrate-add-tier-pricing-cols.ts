/**
 * Phase 19 (19-01) — Add tier-pricing columns to products table.
 *
 * Adds three nullable columns (all NULL for stocked products):
 *   - maxUnitCount  INT NULL
 *   - priceTiers    LONGTEXT NULL  (JSON object e.g. {"1":7,"2":9,...})
 *   - unitField     VARCHAR(64) NULL (name of config field driving lookup)
 *
 * Thin wrapper; idempotent — each column gated by INFORMATION_SCHEMA check.
 * Run: npx tsx scripts/migrate-add-tier-pricing-cols.ts
 *      (or: npx tsx --env-file=.env.local scripts/migrate-add-tier-pricing-cols.ts)
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function columnExists(
  conn: mysql.Connection,
  dbName: string,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const [rows] = await conn.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, tableName, columnName],
  );
  return (rows as unknown[]).length > 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "");

  if (!(await columnExists(conn, dbName, "products", "maxUnitCount"))) {
    await conn.query(
      "ALTER TABLE `products` ADD COLUMN `maxUnitCount` INT NULL AFTER `productType`",
    );
    console.info("[migrate-add-tier-pricing-cols] maxUnitCount column added");
  } else {
    console.info("[migrate-add-tier-pricing-cols] maxUnitCount already exists — no-op");
  }

  if (!(await columnExists(conn, dbName, "products", "priceTiers"))) {
    await conn.query(
      "ALTER TABLE `products` ADD COLUMN `priceTiers` LONGTEXT NULL AFTER `maxUnitCount`",
    );
    console.info("[migrate-add-tier-pricing-cols] priceTiers column added");
  } else {
    console.info("[migrate-add-tier-pricing-cols] priceTiers already exists — no-op");
  }

  if (!(await columnExists(conn, dbName, "products", "unitField"))) {
    await conn.query(
      "ALTER TABLE `products` ADD COLUMN `unitField` VARCHAR(64) NULL AFTER `priceTiers`",
    );
    console.info("[migrate-add-tier-pricing-cols] unitField column added");
  } else {
    console.info("[migrate-add-tier-pricing-cols] unitField already exists — no-op");
  }

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
