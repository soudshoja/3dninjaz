/* eslint-disable no-console */
/**
 * Phase 18 (18-01) — Colour library raw-SQL DDL applicator.
 *
 * Idempotent: re-running on a migrated DB produces zero changes (every
 * mutation is gated by an INFORMATION_SCHEMA existence check).
 *
 * Applies:
 *   1. CREATE TABLE colors  (11 cols, 1 unique, 2 indexes, InnoDB latin1)
 *   2. ALTER product_option_values ADD COLUMN color_id VARCHAR(36) NULL
 *      AFTER swatch_hex
 *   3. ADD CONSTRAINT product_option_values_color_id_fk FK -> colors.id
 *      ON DELETE RESTRICT
 *   4. ADD KEY idx_pov_color (color_id)
 *
 * Run: dotenv -e .env.local -- node scripts/phase18-colours-migrate.cjs
 *   or (fallback): node scripts/phase18-colours-migrate.cjs
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

async function addColumnIfMissing(conn, dbName, tableName, columnName, ddl) {
  const exists = await columnExists(conn, dbName, tableName, columnName);
  if (exists) {
    console.log(`${tableName}.${columnName} -> exists, skipping`);
    return;
  }
  await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`${tableName}.${columnName} -> added`);
}

async function fkExists(conn, dbName, tableName, fkName) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [dbName, tableName, fkName],
  );
  return rows.length > 0;
}

async function indexExists(conn, dbName, tableName, indexName) {
  const [rows] = await conn.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, tableName, indexName],
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
  console.log(`[phase18-colours-migrate] connected to ${dbName}`);

  try {
    // ----------------------------------------------------------------- //
    // 1. colors table — byte-aligned to Drizzle definition in schema.ts
    //    Charset MUST be latin1 to match product_option_values for FK.
    // ----------------------------------------------------------------- //
    if (!(await tableExists(conn, dbName, "colors"))) {
      await conn.query(`
        CREATE TABLE \`colors\` (
          \`id\`              VARCHAR(36) NOT NULL,
          \`name\`            VARCHAR(64) NOT NULL,
          \`hex\`             VARCHAR(7)  NOT NULL,
          \`previous_hex\`    VARCHAR(7)  NULL,
          \`brand\`           ENUM('Bambu','Polymaker','Other') NOT NULL,
          \`code\`            VARCHAR(32) NULL,
          \`family_type\`     ENUM('PLA','PETG','TPU','CF','Other') NOT NULL,
          \`family_subtype\`  VARCHAR(48) NOT NULL,
          \`is_active\`       TINYINT(1) NOT NULL DEFAULT 1,
          \`created_at\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_colors_brand_code\` (\`brand\`, \`code\`),
          KEY \`idx_colors_brand\`  (\`brand\`),
          KEY \`idx_colors_active\` (\`is_active\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
      `);
      console.log("colors -> created");
    } else {
      console.log("colors -> exists, skipping");
    }

    // ----------------------------------------------------------------- //
    // 2. product_option_values.color_id (nullable, AFTER swatch_hex)
    // ----------------------------------------------------------------- //
    await addColumnIfMissing(
      conn,
      dbName,
      "product_option_values",
      "color_id",
      "`color_id` VARCHAR(36) NULL AFTER `swatch_hex`",
    );

    // ----------------------------------------------------------------- //
    // 3. FK — ON DELETE RESTRICT (defense-in-depth alongside app guard)
    // ----------------------------------------------------------------- //
    const fkName = "product_option_values_color_id_fk";
    if (!(await fkExists(conn, dbName, "product_option_values", fkName))) {
      await conn.query(`
        ALTER TABLE \`product_option_values\`
          ADD CONSTRAINT \`${fkName}\`
          FOREIGN KEY (\`color_id\`) REFERENCES \`colors\`(\`id\`) ON DELETE RESTRICT
      `);
      console.log(`product_option_values.${fkName} -> added`);
    } else {
      console.log(`product_option_values.${fkName} -> exists, skipping`);
    }

    // ----------------------------------------------------------------- //
    // 4. Helpful index for lookups by colour
    //    (FK constraint above auto-creates a backing index in MariaDB,
    //     but adding the named idx_pov_color is harmless if it already
    //     exists in some form — we gate on the explicit name to stay
    //     idempotent.)
    // ----------------------------------------------------------------- //
    if (!(await indexExists(conn, dbName, "product_option_values", "idx_pov_color"))) {
      // If the FK auto-created an index under a different name, MariaDB
      // will reuse it for color_id lookups — but we still want our own
      // named index for explicit ownership. ADD KEY is safe here; if a
      // duplicate-index warning is emitted it's harmless.
      try {
        await conn.query(
          "ALTER TABLE `product_option_values` ADD KEY `idx_pov_color` (`color_id`)",
        );
        console.log("product_option_values.idx_pov_color -> added");
      } catch (err) {
        // Some MariaDB versions auto-name the FK index `color_id` and
        // reject a duplicate-named manual index. Treat as no-op.
        const msg = String(err && err.message ? err.message : "");
        if (msg.includes("Duplicate") || msg.includes("ER_DUP_KEYNAME")) {
          console.log("product_option_values.idx_pov_color -> already exists under FK auto-name, skipping");
        } else {
          throw err;
        }
      }
    } else {
      console.log("product_option_values.idx_pov_color -> exists, skipping");
    }

    // ----------------------------------------------------------------- //
    // 5. Verification — assert + emit SHOW CREATE for byte-alignment audit
    // ----------------------------------------------------------------- //
    if (!(await tableExists(conn, dbName, "colors"))) {
      console.error("MISSING table colors after CREATE");
      process.exit(1);
    }
    if (!(await columnExists(conn, dbName, "product_option_values", "color_id"))) {
      console.error("MISSING product_option_values.color_id after ALTER");
      process.exit(1);
    }

    const [colorsCreate] = await conn.query("SHOW CREATE TABLE `colors`");
    console.log("--- SHOW CREATE TABLE colors ---");
    console.log(colorsCreate[0]["Create Table"]);

    const [povCreate] = await conn.query(
      "SHOW CREATE TABLE `product_option_values`",
    );
    console.log("--- SHOW CREATE TABLE product_option_values ---");
    console.log(povCreate[0]["Create Table"]);

    console.log("OK: Phase 18 schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[phase18-colours-migrate] failed:", err);
  process.exit(1);
});
