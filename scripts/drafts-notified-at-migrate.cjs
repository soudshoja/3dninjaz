/* eslint-disable no-console */
/**
 * Stale-draft digest (260815-rsk) — raw-SQL DDL applicator.
 *
 * Adds ONE nullable column:
 *   checkout_drafts.notified_at TIMESTAMP NULL DEFAULT NULL
 *
 * Backs the daily 09:00 MYT WhatsApp digest (scripts/cron/draft-stale-digest.cjs):
 * NULL = this draft has never been reported. The digest stamps it only after a
 * successful send, which is what makes "report each draft exactly once" true
 * even if the cron runs twice or the send fails halfway.
 *
 * NOT a 4th status enum value on purpose — a reported draft is still `open`, so
 * the /admin/drafts open filter, the open count and markDraftsConverted() must
 * all keep matching it.
 *
 * Idempotent: the mutation is gated by an INFORMATION_SCHEMA column check, so
 * re-running on a migrated DB changes nothing and exits 0.
 *
 * MariaDB note: DEFAULT NULL is explicit because MariaDB auto-attaches
 * DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP to the first TIMESTAMP
 * column in a table when no default is given. checkout_drafts already has
 * created_at/updated_at, but being explicit keeps this safe regardless of order.
 *
 * Run: node scripts/drafts-notified-at-migrate.cjs
 *   (reads .env.local automatically — no dotenv-cli required)
 *
 * NB: do NOT run drizzle-kit push against the cPanel remote — it hangs.
 * (CLAUDE.md "MariaDB 10.11 gotchas" rule.)
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

// ---------------------------------------------------------------------------
// Env loader (mirrors whatsapp-migrate / phase20-migrate pattern)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// INFORMATION_SCHEMA helper (idempotent guard)
// ---------------------------------------------------------------------------
async function columnExists(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tableName, columnName],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  loadEnv();

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[drafts-notified-at] DATABASE_URL not set");

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
    throw new Error("[drafts-notified-at] connection has no database selected");
  }
  console.log(`[drafts-notified-at] connected to ${dbName}`);

  try {
    // Fail loudly rather than silently creating nothing if we are pointed at a
    // database that has no checkout_drafts table at all.
    const [tbl] = await conn.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'checkout_drafts'`,
      [dbName],
    );
    if (tbl.length === 0) {
      throw new Error(
        `[drafts-notified-at] checkout_drafts not found in ${dbName} — wrong database?`,
      );
    }

    if (await columnExists(conn, dbName, "checkout_drafts", "notified_at")) {
      console.log(
        "[drafts-notified-at] ⊘ checkout_drafts.notified_at already exists — skipping",
      );
    } else {
      console.log(
        "[drafts-notified-at] adding checkout_drafts.notified_at ...",
      );
      await conn.query(
        "ALTER TABLE `checkout_drafts` ADD COLUMN `notified_at` TIMESTAMP NULL DEFAULT NULL AFTER `status`",
      );
      console.log("[drafts-notified-at] ✓ column added");
    }

    console.log(
      "\n[drafts-notified-at] --- SHOW CREATE TABLE checkout_drafts ---",
    );
    const [create] = await conn.query("SHOW CREATE TABLE `checkout_drafts`");
    console.log(create[0]["Create Table"]);

    const [counts] = await conn.query(
      `SELECT COUNT(*) AS total,
              SUM(notified_at IS NULL) AS never_notified,
              SUM(status = 'open') AS open_rows
       FROM checkout_drafts`,
    );
    console.log(
      `\n[drafts-notified-at] OK — rows=${counts[0].total} open=${counts[0].open_rows} never_notified=${counts[0].never_notified}`,
    );
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[drafts-notified-at] FATAL:", err.message || err);
  process.exit(1);
});
