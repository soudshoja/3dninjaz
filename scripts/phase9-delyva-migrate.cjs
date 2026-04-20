/* eslint-disable no-console */
/**
 * Phase 9 (09-01) — Delyva delivery integration schema migration.
 *
 * Raw-SQL path to match phase7/phase8 migration pattern (drizzle-kit push
 * hangs against the cPanel MariaDB host — see CLAUDE.md quirks). Idempotent:
 * every CREATE uses IF NOT EXISTS; every ALTER checks INFORMATION_SCHEMA
 * before applying.
 *
 * Changes:
 *   1. CREATE TABLE shipping_config (singleton, id='default')
 *   2. CREATE TABLE order_shipments (unique per orderId — phase 1)
 *   3. ALTER TABLE products ADD 4 shipping_* columns (nullable)
 *   4. INSERT INTO shipping_config a 'default' row with KL placeholder origin
 *      — admin overrides via /admin/shipping. ON DUPLICATE KEY UPDATE
 *      touches only updated_at so re-running never mutates real values.
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

async function columnExists(conn, dbName, table, col) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, col],
  );
  return rows.length > 0;
}

async function tableExists(conn, dbName, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table],
  );
  return rows.length > 0;
}

async function createShippingConfig(conn, dbName) {
  if (await tableExists(conn, dbName, "shipping_config")) {
    console.log("skip table shipping_config");
    return;
  }
  await conn.query(`
    CREATE TABLE \`shipping_config\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`origin_address1\` VARCHAR(255) NOT NULL,
      \`origin_address2\` VARCHAR(255) NULL,
      \`origin_city\` VARCHAR(100) NOT NULL,
      \`origin_state\` VARCHAR(100) NOT NULL,
      \`origin_postcode\` VARCHAR(10) NOT NULL,
      \`origin_country\` VARCHAR(2) NOT NULL DEFAULT 'MY',
      \`origin_contact_name\` VARCHAR(100) NOT NULL,
      \`origin_contact_email\` VARCHAR(150) NOT NULL,
      \`origin_contact_phone\` VARCHAR(30) NOT NULL,
      \`default_item_type\` ENUM('PARCEL','PACKAGE','BULKY') NOT NULL DEFAULT 'PACKAGE',
      \`default_weight_kg\` DECIMAL(8,3) NOT NULL DEFAULT '0.500',
      \`markup_percent\` DECIMAL(5,2) NOT NULL DEFAULT '0.00',
      \`markup_flat\` DECIMAL(8,2) NOT NULL DEFAULT '0.00',
      \`free_shipping_threshold\` DECIMAL(10,2) NULL,
      \`enabled_services\` LONGTEXT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1
  `);
  console.log("applied table shipping_config");
}

async function createOrderShipments(conn, dbName) {
  if (await tableExists(conn, dbName, "order_shipments")) {
    console.log("skip table order_shipments");
    return;
  }
  await conn.query(`
    CREATE TABLE \`order_shipments\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`order_id\` VARCHAR(36) NOT NULL,
      \`delyva_order_id\` VARCHAR(50) NULL,
      \`service_code\` VARCHAR(50) NULL,
      \`consignment_no\` VARCHAR(100) NULL,
      \`tracking_no\` VARCHAR(100) NULL,
      \`status_code\` INT NULL,
      \`status_message\` VARCHAR(255) NULL,
      \`personnel_name\` VARCHAR(100) NULL,
      \`personnel_phone\` VARCHAR(30) NULL,
      \`quoted_price\` DECIMAL(10,2) NULL,
      \`service_snapshot\` LONGTEXT NULL,
      \`last_tracking_event_at\` TIMESTAMP NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_shipments_order\` (\`order_id\`),
      KEY \`idx_shipments_delyva_id\` (\`delyva_order_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1
  `);
  console.log("applied table order_shipments");
}

async function addProductShippingColumns(conn, dbName) {
  const cols = [
    { name: "shipping_weight_kg", ddl: "DECIMAL(8,3) NULL" },
    { name: "shipping_length_cm", ddl: "INT NULL" },
    { name: "shipping_width_cm", ddl: "INT NULL" },
    { name: "shipping_height_cm", ddl: "INT NULL" },
  ];
  for (const c of cols) {
    if (await columnExists(conn, dbName, "products", c.name)) {
      console.log(`skip products.${c.name}`);
      continue;
    }
    await conn.query(
      `ALTER TABLE \`products\` ADD COLUMN \`${c.name}\` ${c.ddl}`,
    );
    console.log(`applied products.${c.name}`);
  }
}

async function seedShippingConfig(conn) {
  // KL workshop placeholder — admin overrides via /admin/shipping.
  // ON DUPLICATE KEY UPDATE only updates updated_at so re-running this
  // migration never clobbers real admin-entered values.
  await conn.query(
    `INSERT INTO shipping_config
      (id, origin_address1, origin_address2, origin_city, origin_state,
       origin_postcode, origin_country, origin_contact_name,
       origin_contact_email, origin_contact_phone, default_item_type,
       default_weight_kg, markup_percent, markup_flat, free_shipping_threshold,
       enabled_services)
     VALUES
      (?, ?, NULL, ?, ?, ?, 'MY', ?, ?, ?, 'PACKAGE',
       '0.500', '0.00', '0.00', NULL, NULL)
     ON DUPLICATE KEY UPDATE updated_at = NOW()`,
    [
      "default",
      "Unit 3-01, Menara XYZ",
      "Kuala Lumpur",
      "WP Kuala Lumpur",
      "50450",
      "3D Ninjaz Workshop",
      "ops@3dninjaz.com",
      "+60123456789",
    ],
  );
  console.log("seeded shipping_config (id=default)");
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
    await createShippingConfig(conn, dbName);
    await createOrderShipments(conn, dbName);
    await addProductShippingColumns(conn, dbName);
    await seedShippingConfig(conn);

    // Summary snapshot — confirms the byte-for-byte shape matches Drizzle.
    const [sc] = await conn.query(`SELECT COUNT(*) AS c FROM shipping_config`);
    const [os] = await conn.query(`SELECT COUNT(*) AS c FROM order_shipments`);
    console.log(
      `verify: shipping_config rows=${sc[0].c}  order_shipments rows=${os[0].c}`,
    );
    console.log("phase9-delyva-migrate complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
