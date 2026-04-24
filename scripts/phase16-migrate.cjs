/* eslint-disable no-console */
/**
 * Phase 16 raw-SQL migration — product variant options system.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS; each ALTER TABLE ADD COLUMN checks
 * INFORMATION_SCHEMA first. Safe to re-run.
 *
 * Tables created:
 *   product_options         (id, product_id, name, position)
 *   product_option_values   (id, option_id, value, position, swatch_hex)
 *
 * Columns added to product_variants:
 *   option1_value_id, option2_value_id, option3_value_id, sku, image_url,
 *   label_cache, position
 *
 * Columns added to order_items:
 *   variant_label
 *
 * Legacy `size` column on product_variants is PRESERVED (dropped in 16-07).
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

async function columnExists(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tableName, columnName],
  );
  return rows.length > 0;
}

async function addColumnIfMissing(conn, dbName, tableName, columnName, ddl) {
  const exists = await columnExists(conn, dbName, tableName, columnName);
  if (exists) {
    console.log(`${tableName}.${columnName}  -> exists, skipping`);
    return;
  }
  await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`${tableName}.${columnName}  -> added`);
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName =
    process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`Connected to ${dbName}`);

  try {
    // ------------------------------------------------------------------ //
    // 1. product_options
    // ------------------------------------------------------------------ //
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`product_options\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`product_id\` VARCHAR(36) NOT NULL,
        \`name\`       VARCHAR(64) NOT NULL,
        \`position\`   INT NOT NULL DEFAULT 1,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_product_option_name\`     (\`product_id\`, \`name\`),
        UNIQUE KEY \`uq_product_option_position\` (\`product_id\`, \`position\`),
        KEY \`idx_product_options_product\` (\`product_id\`),
        CONSTRAINT \`product_options_product_id_fk\`
          FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("product_options        -> ensured");

    // ------------------------------------------------------------------ //
    // 2. product_option_values
    // ------------------------------------------------------------------ //
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`product_option_values\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`option_id\`  VARCHAR(36) NOT NULL,
        \`value\`      VARCHAR(64) NOT NULL,
        \`position\`   INT NOT NULL DEFAULT 0,
        \`swatch_hex\` VARCHAR(7) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_option_value\` (\`option_id\`, \`value\`),
        KEY \`idx_option_values_option\` (\`option_id\`),
        CONSTRAINT \`product_option_values_option_id_fk\`
          FOREIGN KEY (\`option_id\`) REFERENCES \`product_options\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("product_option_values  -> ensured");

    // ------------------------------------------------------------------ //
    // 3. product_variants — new columns
    // ------------------------------------------------------------------ //
    await addColumnIfMissing(
      conn, dbName, "product_variants", "option1_value_id",
      "`option1_value_id` VARCHAR(36) NULL AFTER `cost_price_manual`",
    );
    await addColumnIfMissing(
      conn, dbName, "product_variants", "option2_value_id",
      "`option2_value_id` VARCHAR(36) NULL AFTER `option1_value_id`",
    );
    await addColumnIfMissing(
      conn, dbName, "product_variants", "option3_value_id",
      "`option3_value_id` VARCHAR(36) NULL AFTER `option2_value_id`",
    );
    await addColumnIfMissing(
      conn, dbName, "product_variants", "sku",
      "`sku` VARCHAR(64) NULL AFTER `option3_value_id`",
    );
    await addColumnIfMissing(
      conn, dbName, "product_variants", "image_url",
      "`image_url` TEXT NULL AFTER `sku`",
    );
    await addColumnIfMissing(
      conn, dbName, "product_variants", "label_cache",
      "`label_cache` VARCHAR(200) NULL AFTER `image_url`",
    );
    await addColumnIfMissing(
      conn, dbName, "product_variants", "position",
      "`position` INT NOT NULL DEFAULT 0 AFTER `label_cache`",
    );

    // ------------------------------------------------------------------ //
    // 4. order_items — variant_label snapshot
    // ------------------------------------------------------------------ //
    await addColumnIfMissing(
      conn, dbName, "order_items", "variant_label",
      "`variant_label` VARCHAR(200) NULL AFTER `size`",
    );

    // ------------------------------------------------------------------ //
    // 5. Smoke checks
    // ------------------------------------------------------------------ //
    const [tables] = await conn.query("SHOW TABLES");
    const names = tables.map((t) => Object.values(t)[0]);
    const expectedTables = ["product_options", "product_option_values"];
    const missingTables = expectedTables.filter((t) => !names.includes(t));
    if (missingTables.length) {
      console.error("MISSING tables:", missingTables);
      process.exit(1);
    }

    const expectedVariantCols = [
      "option1_value_id",
      "option2_value_id",
      "option3_value_id",
      "sku",
      "image_url",
      "label_cache",
      "position",
    ];
    for (const col of expectedVariantCols) {
      const ok = await columnExists(conn, dbName, "product_variants", col);
      if (!ok) {
        console.error(`MISSING product_variants.${col}`);
        process.exit(1);
      }
    }

    const variantLabelOk = await columnExists(conn, dbName, "order_items", "variant_label");
    if (!variantLabelOk) {
      console.error("MISSING order_items.variant_label");
      process.exit(1);
    }

    console.log("OK: all Phase 16 schema changes applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
