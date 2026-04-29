/* eslint-disable no-console */
/**
 * Phase 19 (19-01) — Made-to-Order product type raw-SQL DDL applicator.
 *
 * Idempotent: re-running on a migrated DB produces zero changes (every
 * mutation is gated by an INFORMATION_SCHEMA existence check).
 *
 * Applies four mutations:
 *   1. products.productType    ENUM('stocked','configurable') NOT NULL DEFAULT 'stocked' AFTER materialType
 *   2. CREATE TABLE product_config_fields  (10 cols, FK cascade, composite index)
 *   3. products.maxUnitCount   INT NULL AFTER productType
 *      products.priceTiers     LONGTEXT NULL AFTER maxUnitCount
 *      products.unitField      VARCHAR(64) NULL AFTER priceTiers
 *   4. order_items.configuration_data  LONGTEXT NULL AFTER variantLabel
 *
 * Run: dotenv -e .env.local -- node scripts/phase19-migrate.cjs
 *   or (fallback): node scripts/phase19-migrate.cjs
 *   (loadEnv() reads .env.local internally if dotenv-cli is not on PATH)
 *
 * NB: do NOT run drizzle-kit push against the cPanel remote — it hangs.
 * (CLAUDE.md "MariaDB 10.11 gotchas" rule.)
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

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

async function tableExists(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName],
  );
  return rows.length > 0;
}

async function columnExists(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tableName, columnName],
  );
  return rows.length > 0;
}

async function constraintExists(conn, dbName, tableName, constraintName) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [dbName, tableName, constraintName],
  );
  return rows.length > 0;
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName =
    process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`[phase19-migrate] connected to ${dbName}`);

  try {
    // ----------------------------------------------------------------- //
    // Mutation 1 — products.productType ENUM('stocked','configurable')  //
    // D-01: Existing rows default to 'stocked' automatically via        //
    // DEFAULT — no UPDATE needed.                                        //
    // ----------------------------------------------------------------- //
    if (!(await columnExists(conn, dbName, "products", "productType"))) {
      await conn.query(
        "ALTER TABLE `products` ADD COLUMN `productType` ENUM('stocked','configurable') NOT NULL DEFAULT 'stocked' AFTER `material_type`",
      );
      console.info("[phase19-migrate] Mutation 1 applied: products.productType added");

      // Verify all existing rows received the default value
      const [verify] = await conn.query(
        "SELECT DISTINCT productType FROM `products`",
      );
      const values = verify.map((r) => r.productType);
      if (values.some((v) => v !== "stocked")) {
        console.error(
          "[phase19-migrate] FAIL: unexpected productType values after migration:",
          values,
        );
        process.exit(1);
      }
      console.info(
        "[phase19-migrate] Verified: DISTINCT productType =",
        values,
      );
    } else {
      console.info(
        "[phase19-migrate] Mutation 1 skipped (already applied): products.productType exists",
      );
    }

    // ----------------------------------------------------------------- //
    // Mutation 2 — CREATE TABLE product_config_fields                   //
    // D-02: Charset latin1 matches products table for FK constraint.    //
    // ----------------------------------------------------------------- //
    if (!(await tableExists(conn, dbName, "product_config_fields"))) {
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
      console.info("[phase19-migrate] Mutation 2 applied: product_config_fields table created");
    } else {
      console.info(
        "[phase19-migrate] Mutation 2 skipped (already applied): product_config_fields table exists",
      );
    }

    // ----------------------------------------------------------------- //
    // Mutation 3 — Tier-pricing columns on products (3 columns)         //
    // D-04: All nullable so stocked products are unaffected.            //
    // ----------------------------------------------------------------- //
    let mutation3Applied = false;

    if (!(await columnExists(conn, dbName, "products", "maxUnitCount"))) {
      await conn.query(
        "ALTER TABLE `products` ADD COLUMN `maxUnitCount` INT NULL AFTER `productType`",
      );
      console.info("[phase19-migrate] Mutation 3a applied: products.maxUnitCount added");
      mutation3Applied = true;
    } else {
      console.info(
        "[phase19-migrate] Mutation 3a skipped (already applied): products.maxUnitCount exists",
      );
    }

    if (!(await columnExists(conn, dbName, "products", "priceTiers"))) {
      await conn.query(
        "ALTER TABLE `products` ADD COLUMN `priceTiers` LONGTEXT NULL AFTER `maxUnitCount`",
      );
      console.info("[phase19-migrate] Mutation 3b applied: products.priceTiers added");
      mutation3Applied = true;
    } else {
      console.info(
        "[phase19-migrate] Mutation 3b skipped (already applied): products.priceTiers exists",
      );
    }

    if (!(await columnExists(conn, dbName, "products", "unitField"))) {
      await conn.query(
        "ALTER TABLE `products` ADD COLUMN `unitField` VARCHAR(64) NULL AFTER `priceTiers`",
      );
      console.info("[phase19-migrate] Mutation 3c applied: products.unitField added");
      mutation3Applied = true;
    } else {
      console.info(
        "[phase19-migrate] Mutation 3c skipped (already applied): products.unitField exists",
      );
    }

    if (!mutation3Applied) {
      console.info("[phase19-migrate] Mutation 3 skipped (already applied): all 3 tier-pricing columns exist");
    }

    // ----------------------------------------------------------------- //
    // Mutation 4 — order_items.configuration_data LONGTEXT NULL         //
    // D-12: JSON snapshot of configurationData at checkout.             //
    // NULL for all stocked-product line items (historical + future).    //
    // ----------------------------------------------------------------- //
    if (!(await columnExists(conn, dbName, "order_items", "configuration_data"))) {
      await conn.query(
        "ALTER TABLE `order_items` ADD COLUMN `configuration_data` LONGTEXT NULL AFTER `variantLabel`",
      );
      console.info("[phase19-migrate] Mutation 4 applied: order_items.configuration_data added");
    } else {
      console.info(
        "[phase19-migrate] Mutation 4 skipped (already applied): order_items.configuration_data exists",
      );
    }

    // ----------------------------------------------------------------- //
    // Verification — SHOW CREATE TABLE for byte-alignment audit         //
    // ----------------------------------------------------------------- //
    const [productsCreate] = await conn.query("SHOW CREATE TABLE `products`");
    console.log("\n--- SHOW CREATE TABLE products ---");
    console.log(productsCreate[0]["Create Table"]);

    const [pcfCreate] = await conn.query(
      "SHOW CREATE TABLE `product_config_fields`",
    );
    console.log("\n--- SHOW CREATE TABLE product_config_fields ---");
    console.log(pcfCreate[0]["Create Table"]);

    const [orderItemsCreate] = await conn.query(
      "SHOW CREATE TABLE `order_items`",
    );
    console.log("\n--- SHOW CREATE TABLE order_items ---");
    console.log(orderItemsCreate[0]["Create Table"]);

    console.info("\nOK: Phase 19 schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[phase19-migrate] failed:", err);
  process.exit(1);
});
