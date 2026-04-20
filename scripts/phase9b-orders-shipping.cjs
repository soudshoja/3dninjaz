/* eslint-disable no-console */
/**
 * Phase 9b — orders.shipping_service_code / shipping_service_name /
 * shipping_quoted_price columns. Stores the customer-selected Delyva courier
 * choice on the order row so /admin/orders can surface "Customer chose J&T
 * NDD, paid MYR 7.90 for shipping" and the Book Courier admin flow can
 * default to that serviceCode.
 *
 * Idempotent: every ALTER checks INFORMATION_SCHEMA before applying.
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

async function addOrderShippingColumns(conn, dbName) {
  const cols = [
    { name: "shipping_service_code", ddl: "VARCHAR(50) NULL" },
    { name: "shipping_service_name", ddl: "VARCHAR(120) NULL" },
    { name: "shipping_quoted_price", ddl: "DECIMAL(10,2) NULL" },
  ];
  for (const c of cols) {
    if (await columnExists(conn, dbName, "orders", c.name)) {
      console.log(`skip orders.${c.name}`);
      continue;
    }
    await conn.query(
      `ALTER TABLE \`orders\` ADD COLUMN \`${c.name}\` ${c.ddl}`,
    );
    console.log(`applied orders.${c.name}`);
  }
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
    await addOrderShippingColumns(conn, dbName);
    console.log("phase9b-orders-shipping complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
