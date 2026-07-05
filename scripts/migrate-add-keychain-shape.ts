/**
 * Quick task 260705-azw — Add `products.keychainShape` ENUM('square','round').
 *
 * Visual-only shape discriminator for keychain-type products. Existing rows
 * default to 'square' so behavior is unchanged until the admin picks 'round'
 * on a product.
 *
 * Idempotent: checks INFORMATION_SCHEMA.COLUMNS and only ALTERs when the
 * column is missing.
 *
 * Run: dotenv -e .env.local -- npx tsx scripts/migrate-add-keychain-shape.ts
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
    [dbName, "products", "keychainShape"],
  );
  const current = (rows as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE ?? "";

  if (current) {
    console.info("[migrate-add-keychain-shape] column already exists — no-op:", current);
    await conn.end();
    return;
  }

  await conn.query(
    "ALTER TABLE `products` ADD COLUMN `keychainShape` ENUM('square','round') NOT NULL DEFAULT 'square'",
  );
  console.info("[migrate-add-keychain-shape] column added");

  const [verify] = await conn.query(
    "SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "products", "keychainShape"],
  );
  console.info("[migrate-add-keychain-shape] verified:", (verify as Record<string, unknown>[])[0]);

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
