/**
 * Phase 19 (19-01) — Create product_config_fields table.
 *
 * Thin wrapper; idempotent — gated by INFORMATION_SCHEMA check.
 * Run: npx tsx scripts/migrate-add-config-fields-table.ts
 *      (or: npx tsx --env-file=.env.local scripts/migrate-add-config-fields-table.ts)
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "");

  const [tables] = await conn.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?",
    [dbName, "product_config_fields"],
  );
  if ((tables as unknown[]).length > 0) {
    console.info("[migrate-add-config-fields-table] product_config_fields already exists — no-op");
    await conn.end();
    return;
  }

  // CREATE TABLE product_config_fields — charset latin1 matches products for FK
  await conn.query(`
    CREATE TABLE \`product_config_fields\` (
      \`id\`          CHAR(36)    NOT NULL,
      \`productId\`   CHAR(36)    NOT NULL,
      \`position\`    INT         NOT NULL DEFAULT 0,
      \`fieldType\`   ENUM('text','number','colour','select') NOT NULL,
      \`label\`       VARCHAR(80) NOT NULL,
      \`helpText\`    VARCHAR(200) NULL,
      \`required\`    BOOLEAN     NOT NULL DEFAULT TRUE,
      \`configJson\`  LONGTEXT    NULL,
      \`createdAt\`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      CONSTRAINT \`fk_pcf_product\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE,
      KEY \`idx_pcf_product\` (\`productId\`, \`position\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1
  `);
  console.info("[migrate-add-config-fields-table] product_config_fields table created");

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
