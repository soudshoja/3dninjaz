/* eslint-disable no-console */
/**
 * Customer abandoned-checkout reminder (260816) — raw-SQL DDL applicator.
 *
 * Adds ONE nullable column:
 *   checkout_drafts.customer_notified_at TIMESTAMP NULL DEFAULT NULL
 *
 * Deliberately separate from notified_at (which tracks the ADMIN digest).
 * Sharing one column would mean sending the admin digest suppressed the
 * customer reminder and vice versa. NULL = this customer has never been
 * reminded; the cron sets it once, so exactly one reminder is ever sent.
 *
 * Idempotent: gated by an INFORMATION_SCHEMA check, so re-running changes
 * nothing and exits 0.
 *
 * Run: node scripts/drafts-customer-notified-at-migrate.cjs
 *   (reads .env.local automatically)
 *
 * NB: do NOT run drizzle-kit push against the cPanel remote — it hangs.
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

async function columnExists(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tableName, columnName],
  );
  return rows.length > 0;
}

async function run() {
  loadEnv();

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[drafts-customer-notified-at] DATABASE_URL not set");

  const conn = await mysql.createConnection(url);

  // Ask the CONNECTION which schema it is on. Do NOT trust process.env.DB_NAME:
  // prod's .env.local carries a stale DB_NAME=ninjaz_3dn (the dev database,
  // which also happens to match the DB *user* name) while DATABASE_URL points
  // at ninjaz_3dnp. Deriving the name from env made every INFORMATION_SCHEMA
  // guard below inspect the WRONG schema — the column was found on dev, the
  // ALTER was skipped, and prod silently stayed unmigrated.
  const [dbRows] = await conn.query("SELECT DATABASE() AS db");
  const dbName = dbRows[0] && dbRows[0].db;
  if (!dbName) {
    throw new Error(
      "[drafts-customer-notified-at] connection has no database selected",
    );
  }
  console.log(`[drafts-customer-notified-at] connected to ${dbName}`);

  try {
    const [tbl] = await conn.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'checkout_drafts'`,
      [dbName],
    );
    if (tbl.length === 0) {
      throw new Error(
        `[drafts-customer-notified-at] checkout_drafts not found in ${dbName} — wrong database?`,
      );
    }

    // The admin-digest column must exist first — this migration builds on it.
    if (!(await columnExists(conn, dbName, "checkout_drafts", "notified_at"))) {
      throw new Error(
        "[drafts-customer-notified-at] notified_at is missing — run scripts/drafts-notified-at-migrate.cjs first",
      );
    }

    if (
      await columnExists(conn, dbName, "checkout_drafts", "customer_notified_at")
    ) {
      console.log(
        "[drafts-customer-notified-at] ⊘ checkout_drafts.customer_notified_at already exists — skipping",
      );
    } else {
      console.log(
        "[drafts-customer-notified-at] adding checkout_drafts.customer_notified_at ...",
      );
      await conn.query(
        "ALTER TABLE `checkout_drafts` ADD COLUMN `customer_notified_at` TIMESTAMP NULL DEFAULT NULL AFTER `notified_at`",
      );
      console.log("[drafts-customer-notified-at] ✓ column added");
    }

    console.log(
      "\n[drafts-customer-notified-at] --- SHOW CREATE TABLE checkout_drafts ---",
    );
    const [create] = await conn.query("SHOW CREATE TABLE `checkout_drafts`");
    console.log(create[0]["Create Table"]);

    // Report the reminder's on/off state so the operator can see at a glance
    // that it ships disabled.
    const [notif] = await conn.query(
      `SELECT event_key, enabled FROM whatsapp_notifications
        WHERE event_key = 'draft_abandoned_reminder'`,
    );
    if (notif.length === 0) {
      console.log(
        "\n[drafts-customer-notified-at] draft_abandoned_reminder row not seeded yet — it is created (disabled) on the next /admin/notifications visit",
      );
    } else {
      console.log(
        `\n[drafts-customer-notified-at] draft_abandoned_reminder enabled=${notif[0].enabled}`,
      );
    }
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[drafts-customer-notified-at] FATAL:", err.message || err);
  process.exit(1);
});
