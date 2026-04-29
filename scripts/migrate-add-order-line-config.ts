/**
 * Phase 19 (19-01) — Add order_items.configuration_data column.
 *
 * Stores a JSON snapshot of configurationData at checkout for made-to-order
 * products. NULL for all stocked-product line items (historical + future).
 *
 * Thin wrapper; idempotent — gated by INFORMATION_SCHEMA check.
 * Run: npx tsx scripts/migrate-add-order-line-config.ts
 *      (or: npx tsx --env-file=.env.local scripts/migrate-add-order-line-config.ts)
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "");

  const [cols] = await conn.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "order_items", "configuration_data"],
  );
  if ((cols as unknown[]).length > 0) {
    console.info("[migrate-add-order-line-config] configuration_data already exists — no-op");
    await conn.end();
    return;
  }

  await conn.query(
    "ALTER TABLE `order_items` ADD COLUMN `configuration_data` LONGTEXT NULL AFTER `variantLabel`",
  );
  console.info("[migrate-add-order-line-config] configuration_data column added");

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
