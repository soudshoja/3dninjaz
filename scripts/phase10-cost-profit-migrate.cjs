/* eslint-disable no-console */
/**
 * Phase 10 (10-01) — Product cost + order profit tracking.
 *
 * Adds three columns (all nullable / default 0 so existing rows stay valid):
 *   1. product_variants.cost_price   DECIMAL(10,2) NULL       — per-variant unit cost
 *   2. order_items.unit_cost         DECIMAL(10,2) NULL       — snapshotted cost at checkout
 *   3. orders.extra_cost             DECIMAL(10,2) NOT NULL 0 — one-off packaging / rush material
 *   4. orders.extra_cost_note        VARCHAR(255) NULL        — free-text label for extra_cost
 *
 * Raw-SQL path (drizzle-kit push hangs against the cPanel MariaDB host — see
 * CLAUDE.md quirks). Idempotent: every ALTER checks INFORMATION_SCHEMA before
 * applying so re-running is a no-op.
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

async function addColumn(conn, dbName, table, name, ddl) {
  if (await columnExists(conn, dbName, table, name)) {
    console.log(`skip ${table}.${name}`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${ddl}`);
  console.log(`applied ${table}.${name}`);
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
    // 1. product_variants.cost_price AFTER price
    await addColumn(
      conn,
      dbName,
      "product_variants",
      "cost_price",
      "DECIMAL(10,2) NULL AFTER `price`",
    );

    // 2. order_items.unit_cost AFTER unit_price
    await addColumn(
      conn,
      dbName,
      "order_items",
      "unit_cost",
      "DECIMAL(10,2) NULL AFTER `unit_price`",
    );

    // 3. orders.extra_cost (default 0 so existing rows don't violate NOT NULL)
    await addColumn(
      conn,
      dbName,
      "orders",
      "extra_cost",
      "DECIMAL(10,2) NOT NULL DEFAULT '0.00'",
    );

    // 4. orders.extra_cost_note
    await addColumn(
      conn,
      dbName,
      "orders",
      "extra_cost_note",
      "VARCHAR(255) NULL",
    );

    // Verify — a quick shape check, safe to read by anyone.
    const [pvCols] = await conn.query(
      `SHOW COLUMNS FROM product_variants LIKE 'cost_price'`,
    );
    const [oiCols] = await conn.query(
      `SHOW COLUMNS FROM order_items LIKE 'unit_cost'`,
    );
    const [oECols] = await conn.query(
      `SHOW COLUMNS FROM orders LIKE 'extra_cost'`,
    );
    const [oENCols] = await conn.query(
      `SHOW COLUMNS FROM orders LIKE 'extra_cost_note'`,
    );
    console.log(
      `verify: product_variants.cost_price=${pvCols.length}  order_items.unit_cost=${oiCols.length}  orders.extra_cost=${oECols.length}  orders.extra_cost_note=${oENCols.length}`,
    );
    console.log("phase10-cost-profit-migrate complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
