/**
 * Phase — Add 'vending' to products.productType ENUM.
 *
 * Idempotent: checks current ENUM definition and only ALTERs when 'vending' is missing.
 * Run: dotenv -e .env.local -- npx tsx scripts/migrate-add-vending-product-type.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "");

  const [rows] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "products", "productType"],
  );
  const current = (rows as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE ?? "";

  if (!current) {
    console.error(
      "[migrate-add-vending] productType column missing — run migrate-add-product-type.ts first",
    );
    await conn.end();
    process.exit(1);
  }

  if (current.includes("'vending'")) {
    console.info("[migrate-add-vending] 'vending' already in ENUM — no-op");
    await conn.end();
    return;
  }

  await conn.query(
    "ALTER TABLE `products` MODIFY COLUMN `productType` ENUM('stocked','configurable','keychain','vending') NOT NULL DEFAULT 'stocked'",
  );
  console.info("[migrate-add-vending] ENUM extended with 'vending'");

  const [verify] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "products", "productType"],
  );
  console.info("[migrate-add-vending] new column type:", (verify as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE);

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
