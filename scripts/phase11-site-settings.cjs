/* eslint-disable no-console */
/**
 * Phase 11 — Social & contact settings.
 *
 * Extends `store_settings` (singleton, id='default') with:
 *   - contact_phone   VARCHAR(32)  NOT NULL DEFAULT ''
 *   - twitter_url     VARCHAR(500) NOT NULL DEFAULT ''
 *   - whatsapp_url    VARCHAR(500) NOT NULL DEFAULT ''
 *   - facebook_url    VARCHAR(500) NOT NULL DEFAULT ''
 *   - like_url        VARCHAR(500) NOT NULL DEFAULT ''
 *
 * Idempotent — every ALTER checks INFORMATION_SCHEMA before applying, so
 * re-running is a no-op. Defaults are empty strings so the SocialLinks
 * component naturally hides icons whose URL has not been set.
 *
 * Phase 5 already introduced `instagram_url` and `tiktok_url` so they are
 * NOT re-added here. `contact_email` + `whatsapp_number` + `whatsapp_number_display`
 * are also pre-existing.
 *
 * Raw-SQL path (drizzle-kit push hangs against the cPanel MariaDB host — see
 * CLAUDE.md quirks).
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

async function tableExists(conn, dbName, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table],
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
  console.log(`Connected to ${dbName}`);

  try {
    if (!(await tableExists(conn, dbName, "store_settings"))) {
      throw new Error(
        "store_settings table does not exist — run the Phase 5 migration first.",
      );
    }

    // Columns added AFTER the pre-existing sibling columns to keep the DDL
    // ordering sensible when an operator runs SHOW CREATE TABLE.
    await addColumn(
      conn,
      dbName,
      "store_settings",
      "contact_phone",
      "VARCHAR(32) NOT NULL DEFAULT '' AFTER `contact_email`",
    );
    await addColumn(
      conn,
      dbName,
      "store_settings",
      "twitter_url",
      "VARCHAR(500) NOT NULL DEFAULT '' AFTER `tiktok_url`",
    );
    await addColumn(
      conn,
      dbName,
      "store_settings",
      "whatsapp_url",
      "VARCHAR(500) NOT NULL DEFAULT '' AFTER `twitter_url`",
    );
    await addColumn(
      conn,
      dbName,
      "store_settings",
      "facebook_url",
      "VARCHAR(500) NOT NULL DEFAULT '' AFTER `whatsapp_url`",
    );
    await addColumn(
      conn,
      dbName,
      "store_settings",
      "like_url",
      "VARCHAR(500) NOT NULL DEFAULT '' AFTER `facebook_url`",
    );

    // Verify shape
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'store_settings'
       AND COLUMN_NAME IN ('contact_phone','twitter_url','whatsapp_url','facebook_url','like_url')
       ORDER BY COLUMN_NAME`,
      [dbName],
    );
    console.log("verify columns:");
    for (const r of rows) {
      console.log(
        `  ${r.COLUMN_NAME.padEnd(16)} ${r.COLUMN_TYPE.padEnd(14)} null=${r.IS_NULLABLE} default=${JSON.stringify(r.COLUMN_DEFAULT)}`,
      );
    }
    console.log("phase11-site-settings complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
