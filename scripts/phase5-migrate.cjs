/* eslint-disable no-console */
/**
 * Phase 5 05-01 raw SQL migration — fallback path when drizzle-kit push hangs
 * against the cPanel MariaDB host (Phase 3/6 precedent).
 *
 * Idempotent: every CREATE uses IF NOT EXISTS; the product_variants column
 * additions check INFORMATION_SCHEMA before adding. Safe to re-run.
 *
 * Phase 5 surface:
 *   - product_variants.in_stock BOOLEAN NOT NULL DEFAULT TRUE (INV-01)
 *   - product_variants.low_stock_threshold INT NULL              (INV-02)
 *   - coupons + coupon_redemptions                               (PROMO-01/02)
 *   - email_templates                                            (ADM-11)
 *   - store_settings (singleton)                                 (SETTINGS-01)
 *   - shipping_rates (16 MY states, seeded at 0.00)              (SHIP-01)
 *   - events (analytics, ip-hash only)                           (REPORT-01)
 *
 * Phase 6 owns: addresses, wishlists, order_requests, reviews, user.deletedAt.
 * If those tables are missing this script does NOT add them — see
 * scripts/phase6-migrate.cjs.
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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

async function ensureColumn(conn, dbName, table, column, ddl) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column],
  );
  if (cols.length > 0) {
    console.log(`${table}.${column}  -> exists, skipping ALTER`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`${table}.${column}  -> added`);
}

const MALAYSIAN_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "Kuala Lumpur",
  "Labuan",
  "Putrajaya",
];

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);

  const dbName = process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`Connected to ${dbName}`);

  try {
    // -------------------------------------------------------------------
    // product_variants column additions (INV-01, INV-02)
    // -------------------------------------------------------------------
    await ensureColumn(
      conn,
      dbName,
      "product_variants",
      "in_stock",
      "`in_stock` BOOLEAN NOT NULL DEFAULT TRUE",
    );
    await ensureColumn(
      conn,
      dbName,
      "product_variants",
      "low_stock_threshold",
      "`low_stock_threshold` INT NULL",
    );

    // -------------------------------------------------------------------
    // coupons (PROMO-01/02)
    // -------------------------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`coupons\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`code\` VARCHAR(32) NOT NULL,
        \`type\` ENUM('percentage','fixed') NOT NULL,
        \`amount\` DECIMAL(10,2) NOT NULL,
        \`min_spend\` DECIMAL(10,2) NULL,
        \`starts_at\` TIMESTAMP NULL,
        \`ends_at\` TIMESTAMP NULL,
        \`usage_cap\` INT NULL,
        \`usage_count\` INT NOT NULL DEFAULT 0,
        \`active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`coupons_code_unique\` (\`code\`),
        KEY \`coupons_active_idx\` (\`active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("coupons          -> ensured");

    // -------------------------------------------------------------------
    // coupon_redemptions (PDPA-safe — userId NO cascade)
    // -------------------------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`coupon_redemptions\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`coupon_id\` VARCHAR(36) NOT NULL,
        \`order_id\` VARCHAR(36) NOT NULL,
        \`user_id\` VARCHAR(36) NOT NULL,
        \`amount_applied\` DECIMAL(10,2) NOT NULL,
        \`redeemed_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`coupon_redemptions_coupon_idx\` (\`coupon_id\`),
        KEY \`coupon_redemptions_order_idx\` (\`order_id\`),
        CONSTRAINT \`coupon_redemptions_coupon_fk\` FOREIGN KEY (\`coupon_id\`) REFERENCES \`coupons\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`coupon_redemptions_order_fk\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`coupon_redemptions_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("coupon_redemptions -> ensured");

    // -------------------------------------------------------------------
    // email_templates (ADM-11) — `key` is the PK so seed/upsert is idempotent
    // -------------------------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`email_templates\` (
        \`key\` VARCHAR(64) NOT NULL,
        \`subject\` VARCHAR(200) NOT NULL,
        \`html\` MEDIUMTEXT NOT NULL,
        \`variables\` JSON NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("email_templates  -> ensured");

    // -------------------------------------------------------------------
    // store_settings (singleton, SETTINGS-01)
    // -------------------------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`store_settings\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT 'default',
        \`business_name\` VARCHAR(200) NOT NULL,
        \`contact_email\` VARCHAR(255) NOT NULL,
        \`whatsapp_number\` VARCHAR(32) NOT NULL,
        \`whatsapp_number_display\` VARCHAR(32) NOT NULL,
        \`instagram_url\` VARCHAR(500) NOT NULL DEFAULT '#',
        \`tiktok_url\` VARCHAR(500) NOT NULL DEFAULT '#',
        \`banner_text\` VARCHAR(500) NULL,
        \`banner_enabled\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`free_ship_threshold\` DECIMAL(10,2) NULL,
        \`sst_enabled\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`sst_rate\` DECIMAL(4,2) NOT NULL DEFAULT '6.00',
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("store_settings   -> ensured");

    // -------------------------------------------------------------------
    // shipping_rates (SHIP-01) — UNIQUE state so seed+upsert is safe
    // -------------------------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`shipping_rates\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`state\` VARCHAR(64) NOT NULL,
        \`flat_rate\` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`shipping_rates_state_unique\` (\`state\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("shipping_rates   -> ensured");

    // Seed 16 MY state rows at 0.00 if table is empty
    const [rateCountRows] = await conn.query(
      "SELECT COUNT(*) AS c FROM `shipping_rates`",
    );
    if (Number(rateCountRows[0].c) === 0) {
      const values = MALAYSIAN_STATES.map(
        (s) => [crypto.randomUUID(), s, "0.00"],
      );
      await conn.query(
        "INSERT INTO `shipping_rates` (`id`, `state`, `flat_rate`) VALUES ?",
        [values],
      );
      console.log(`shipping_rates   -> seeded ${values.length} rows`);
    } else {
      console.log("shipping_rates   -> seed skipped (rows already present)");
    }

    // -------------------------------------------------------------------
    // events (REPORT-01) — analytics, IP-hash only (PDPA T-05-02-PDPA)
    // -------------------------------------------------------------------
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`events\` (
        \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`event\` ENUM('page_view','add_to_bag','checkout_started') NOT NULL,
        \`session_id\` VARCHAR(64) NULL,
        \`ip_hash\` VARCHAR(64) NULL,
        \`path\` VARCHAR(200) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`events_event_created_idx\` (\`event\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("events           -> ensured");

    // -------------------------------------------------------------------
    // Smoke check
    // -------------------------------------------------------------------
    const [tables] = await conn.query("SHOW TABLES");
    const names = tables.map((t) => Object.values(t)[0]);
    const expected = [
      "coupons",
      "coupon_redemptions",
      "email_templates",
      "store_settings",
      "shipping_rates",
      "events",
    ];
    const missing = expected.filter((t) => !names.includes(t));
    if (missing.length) {
      console.error("MISSING:", missing);
      process.exit(1);
    }

    // Verify variant columns
    const [vcols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'product_variants'
       AND COLUMN_NAME IN ('in_stock','low_stock_threshold')`,
      [dbName],
    );
    if (vcols.length !== 2) {
      console.error(
        "MISSING variant columns:",
        ["in_stock", "low_stock_threshold"].filter(
          (c) => !vcols.find((v) => v.COLUMN_NAME === c),
        ),
      );
      process.exit(1);
    }
    console.log("OK: all Phase 5 tables + variant columns present");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
