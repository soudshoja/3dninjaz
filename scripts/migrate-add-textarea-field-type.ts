/**
 * Quick task 260430-icx — Add 'textarea' to product_config_fields.fieldType ENUM.
 *
 * Idempotent: checks current ENUM definition and only ALTERs when 'textarea' is missing.
 * Run: npx dotenv -e .env.local -- npx tsx scripts/migrate-add-textarea-field-type.ts
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
    [dbName, "product_config_fields", "fieldType"],
  );
  const current = (rows as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE ?? "";

  if (!current) {
    console.error(
      "[migrate-add-textarea] product_config_fields.fieldType column missing — phase 19 migration not run",
    );
    await conn.end();
    process.exit(1);
  }

  if (current.includes("'textarea'")) {
    console.info("[migrate-add-textarea] 'textarea' already in ENUM — no-op");
    await conn.end();
    return;
  }

  await conn.query(
    "ALTER TABLE `product_config_fields` MODIFY COLUMN `fieldType` ENUM('text','number','colour','select','textarea') NOT NULL",
  );
  console.info("[migrate-add-textarea] ENUM extended with 'textarea'");

  const [verify] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "product_config_fields", "fieldType"],
  );
  console.info("[migrate-add-textarea] new column type:", (verify as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE);

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
