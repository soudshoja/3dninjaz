/**
 * Phase 19 (19-01) — Add products.productType discriminator column.
 *
 * Thin wrapper; idempotent — gated by INFORMATION_SCHEMA check.
 * Run: npx tsx scripts/migrate-add-product-type.ts
 *      (or: npx tsx --env-file=.env.local scripts/migrate-add-product-type.ts)
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
    [dbName, "products", "productType"],
  );
  if ((cols as unknown[]).length > 0) {
    console.info("[migrate-add-product-type] productType already exists — no-op");
    await conn.end();
    return;
  }

  await conn.query(
    "ALTER TABLE `products` ADD COLUMN `productType` ENUM('stocked','configurable') NOT NULL DEFAULT 'stocked' AFTER `material_type`",
  );
  console.info("[migrate-add-product-type] productType column added");

  const [verify] = await conn.query("SELECT DISTINCT productType FROM `products`");
  console.info("[migrate-add-product-type] distinct productType values:", verify);

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
