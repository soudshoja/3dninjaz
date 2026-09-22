/* eslint-disable no-console */
/**
 * 260922-shipto — orders.address_correction_* raw-SQL DDL applicator.
 *
 * Adds three nullable/defaulted columns to `orders` so admins can flag a
 * shipped/delivered order's address as needing a correction WITHOUT silently
 * rewriting the shipping snapshot (the courier already has the old address
 * printed on the label — see CLAUDE.md "Pivots & Production Quirks" and the
 * flagAddressCorrection() doc comment in src/actions/admin-orders.ts):
 *
 *   - address_correction_requested        TINYINT(1) NOT NULL DEFAULT 0
 *   - address_correction_note             TEXT       NULL
 *   - address_correction_requested_at     TIMESTAMP  NULL
 *
 * Idempotent: re-running on a migrated DB produces zero changes (every
 * ALTER is gated by an INFORMATION_SCHEMA.COLUMNS existence check).
 *
 * Mirrors scripts/whatsapp-outbox-migrate.cjs (260920-whatsapp-outbox):
 *   - DB_NAME trap (CLAUDE.md "Migration DB_NAME trap") — the LIVE
 *     `SELECT DATABASE()` result is the ONLY authority used for
 *     INFORMATION_SCHEMA guards, never DB_NAME or the DATABASE_URL path.
 *   - `--expect-db=<name>` aborts non-zero on mismatch. Prod must be run as:
 *       node scripts/migrate-add-address-correction.cjs --expect-db=ninjaz_3dnp
 *   - `--dry-run` prints the DDL for each pending column, touches nothing.
 *
 * Does NOT use drizzle-kit push (documented hang against this remote —
 * CLAUDE.md "MariaDB 10.11 gotchas").
 *
 * Run (dev):
 *   node scripts/migrate-add-address-correction.cjs --dry-run
 *   node scripts/migrate-add-address-correction.cjs
 * Run (prod, human-approved step — DO NOT run from an agent):
 *   node scripts/migrate-add-address-correction.cjs --expect-db=ninjaz_3dnp
 *
 * NOT RUN YET as of this commit — must be applied to both dev and prod
 * before this feature's UI/actions are exercised, or the queries will fail
 * with ER_BAD_FIELD_ERROR.
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { dryRun: false, expectDb: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--expect-db=")) args.expectDb = arg.slice("--expect-db=".length);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Env loader (mirrors whatsapp-outbox-migrate.cjs pattern — no dotenv-cli
// dependency)
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

// Column definitions applied in order — each is a single, independent
// ADD COLUMN so a partial prior run (e.g. killed mid-way) is still safe to
// resume; the existence check skips whatever already landed.
const COLUMNS = [
  {
    name: "address_correction_requested",
    ddl: "ALTER TABLE `orders` ADD COLUMN `address_correction_requested` TINYINT(1) NOT NULL DEFAULT 0",
  },
  {
    name: "address_correction_note",
    ddl: "ALTER TABLE `orders` ADD COLUMN `address_correction_note` TEXT NULL",
  },
  {
    name: "address_correction_requested_at",
    ddl: "ALTER TABLE `orders` ADD COLUMN `address_correction_requested_at` TIMESTAMP NULL",
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[address-correction-migrate] DATABASE_URL not set");

  // Step 1 — derive dbName from the URL pathname FIRST (phase21 precedent).
  let dbNameFromUrl = null;
  try {
    dbNameFromUrl = new URL(url).pathname.replace(/^\//, "") || null;
  } catch {
    dbNameFromUrl = null;
  }
  const dbNameFallback = dbNameFromUrl || process.env.DB_NAME;

  const conn = await mysql.createConnection(url);

  try {
    // Step 2 — the LIVE connection's own schema is the ONLY authority used
    // for INFORMATION_SCHEMA guards below. This cannot be fooled by a stale
    // DB_NAME env var.
    const [dbRows] = await conn.query("SELECT DATABASE() AS db");
    const liveDbName = dbRows[0].db;

    console.log(`[address-correction-migrate] connected to ${liveDbName}`);

    // Step 3 — loud warning if DB_NAME disagrees with reality.
    if (process.env.DB_NAME && process.env.DB_NAME !== liveDbName) {
      console.warn(
        `[address-correction-migrate] WARNING: DB_NAME=${process.env.DB_NAME} but connected to ${liveDbName} — ignoring DB_NAME`,
      );
    }
    if (dbNameFallback && dbNameFallback !== liveDbName) {
      console.warn(
        `[address-correction-migrate] WARNING: DATABASE_URL path implies "${dbNameFallback}" but SELECT DATABASE() reports "${liveDbName}" — using "${liveDbName}"`,
      );
    }

    // Step 4 — --expect-db guard.
    if (args.expectDb && args.expectDb !== liveDbName) {
      console.error(
        `[address-correction-migrate] FATAL: --expect-db=${args.expectDb} but connected to ${liveDbName}. Aborting.`,
      );
      process.exitCode = 1;
      return;
    }

    const dbName = liveDbName;

    if (args.dryRun) {
      console.log("[address-correction-migrate] --dry-run: would check/apply the following columns on `orders`:");
      for (const col of COLUMNS) {
        const exists = await columnExists(conn, dbName, "orders", col.name);
        console.log(`  [${exists ? "exists — skip" : "MISSING — would apply"}] ${col.name}`);
        console.log(`    ${col.ddl}`);
      }
      console.log("[address-correction-migrate] --dry-run: no changes made.");
      return;
    }

    const applied = [];
    const skipped = [];

    for (const col of COLUMNS) {
      const exists = await columnExists(conn, dbName, "orders", col.name);
      if (exists) {
        console.log(`[address-correction-migrate] ⊘ orders.${col.name} already exists — skipping`);
        skipped.push(col.name);
        continue;
      }
      console.log(`[address-correction-migrate] Adding orders.${col.name}...`);
      await conn.query(col.ddl);
      console.log(`[address-correction-migrate] ✓ orders.${col.name} added`);
      applied.push(col.name);
    }

    // Verification — confirm all three columns are present post-run.
    console.log("\n[address-correction-migrate] --- verifying columns ---");
    for (const col of COLUMNS) {
      const [verify] = await conn.query(
        "SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
        [dbName, "orders", col.name],
      );
      if (!verify[0]) {
        console.error(`[address-correction-migrate] FATAL: orders.${col.name} is missing after migration. Aborting.`);
        process.exitCode = 1;
        return;
      }
      console.log(`  orders.${col.name}:`, verify[0]);
    }

    console.log("\n[address-correction-migrate] ========== SUMMARY ==========");
    console.log(`  Applied  (${applied.length}): ${applied.join(", ") || "none"}`);
    console.log(`  Skipped  (${skipped.length}): ${skipped.join(", ") || "none"}`);
    console.log("[address-correction-migrate] OK: orders.address_correction_* schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[address-correction-migrate] FATAL:", err.message || err);
  process.exitCode = 1;
});
