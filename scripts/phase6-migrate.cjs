/* eslint-disable no-console */
/**
 * Phase 6 06-01 raw SQL migration — fallback path when drizzle-kit push hangs
 * against the cPanel MariaDB host (Phase 3 precedent).
 *
 * Idempotent: every CREATE uses IF NOT EXISTS; the user.deletedAt ALTER
 * checks INFORMATION_SCHEMA before adding. Safe to re-run.
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

async function ensureDeletedAtColumn(conn, dbName) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user' AND COLUMN_NAME = 'deleted_at'`,
    [dbName],
  );
  if (cols.length > 0) {
    console.log("user.deleted_at  -> exists, skipping ALTER");
    return;
  }
  await conn.query(
    `ALTER TABLE \`user\` ADD COLUMN \`deleted_at\` TIMESTAMP NULL AFTER \`pdpa_consent_at\``,
  );
  console.log("user.deleted_at  -> added");
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);

  // Detect DB name from URL or env so the column-existence check is precise.
  const dbName = process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`Connected to ${dbName}`);

  try {
    await ensureDeletedAtColumn(conn, dbName);

    // addresses
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`addresses\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`user_id\` VARCHAR(36) NOT NULL,
        \`full_name\` VARCHAR(200) NOT NULL,
        \`phone\` VARCHAR(32) NOT NULL,
        \`line1\` VARCHAR(200) NOT NULL,
        \`line2\` VARCHAR(200) NULL,
        \`city\` VARCHAR(100) NOT NULL,
        \`state\` VARCHAR(64) NOT NULL,
        \`postcode\` VARCHAR(10) NOT NULL,
        \`country\` VARCHAR(64) NOT NULL DEFAULT 'Malaysia',
        \`is_default\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`addresses_user_idx\` (\`user_id\`),
        CONSTRAINT \`addresses_user_id_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("addresses        -> ensured");

    // wishlists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`wishlists\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`user_id\` VARCHAR(36) NOT NULL,
        \`product_id\` VARCHAR(36) NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`wishlists_user_product_unique\` (\`user_id\`, \`product_id\`),
        KEY \`wishlists_user_idx\` (\`user_id\`),
        CONSTRAINT \`wishlists_user_id_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`wishlists_product_id_products_id_fk\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("wishlists        -> ensured");

    // order_requests
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`order_requests\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`order_id\` VARCHAR(36) NOT NULL,
        \`user_id\` VARCHAR(36) NOT NULL,
        \`type\` ENUM('cancel','return') NOT NULL,
        \`reason\` TEXT NOT NULL,
        \`status\` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        \`admin_notes\` TEXT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`resolved_at\` TIMESTAMP NULL,
        PRIMARY KEY (\`id\`),
        KEY \`order_requests_order_idx\` (\`order_id\`),
        KEY \`order_requests_order_status_idx\` (\`order_id\`, \`status\`),
        CONSTRAINT \`order_requests_order_id_orders_id_fk\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`order_requests_user_id_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("order_requests   -> ensured");

    // reviews (Phase 5 owns; we create as fallback if missing)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`reviews\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`product_id\` VARCHAR(36) NOT NULL,
        \`user_id\` VARCHAR(36) NOT NULL,
        \`rating\` INT NOT NULL,
        \`body\` TEXT NOT NULL,
        \`status\` ENUM('pending','approved','hidden') NOT NULL DEFAULT 'pending',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`reviews_user_product_unique\` (\`user_id\`, \`product_id\`),
        KEY \`reviews_product_status_idx\` (\`product_id\`, \`status\`),
        CONSTRAINT \`reviews_product_id_products_id_fk\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`reviews_user_id_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("reviews          -> ensured");

    // Smoke check
    const [tables] = await conn.query("SHOW TABLES");
    const names = tables.map((t) => Object.values(t)[0]);
    const expected = ["addresses", "wishlists", "order_requests", "reviews"];
    const missing = expected.filter((t) => !names.includes(t));
    if (missing.length) {
      console.error("MISSING:", missing);
      process.exit(1);
    }
    console.log("OK: all Phase 6 tables present");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
