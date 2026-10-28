/* eslint-disable no-console */
/**
 * 260920-whatsapp-outbox (Task 3) — whatsapp_outbox raw-SQL DDL applicator.
 *
 * Idempotent: re-running on a migrated DB produces zero changes (CREATE is
 * gated by an INFORMATION_SCHEMA existence check).
 *
 * DB_NAME trap (CLAUDE.md — "Migration DB_NAME trap"): prod's `.env.local`
 * has been observed carrying DB_NAME=ninjaz_3dn (the DEV schema) while
 * DATABASE_URL correctly points at ninjaz_3dnp. A script that reads DB_NAME
 * first and uses it for INFORMATION_SCHEMA guards will silently check the
 * WRONG schema and no-op on prod. This script is deliberately stricter than
 * the phase21 precedent:
 *
 *   1. Derive dbName from `new URL(DATABASE_URL).pathname` FIRST, DB_NAME
 *      only as a fallback when the URL has no path (mirrors
 *      scripts/phase21-migrate.cjs:79).
 *   2. Additionally run `SELECT DATABASE()` on the LIVE connection and use
 *      THAT as the authority for every INFORMATION_SCHEMA guard — the
 *      connection's actual schema cannot lie about which DB it's on.
 *   3. If DB_NAME is set and differs from SELECT DATABASE(), print a loud
 *      WARNING and ignore DB_NAME entirely.
 *   4. Support `--expect-db=<name>`; abort non-zero on mismatch. Prod must
 *      be run as:
 *        node scripts/whatsapp-outbox-migrate.cjs --expect-db=ninjaz_3dnp
 *   5. Support `--dry-run` — prints the DDL, touches nothing.
 *   6. After CREATE, asserts `uq_outbox_idem` exists in
 *      INFORMATION_SCHEMA.STATISTICS and exits non-zero if not. Nothing else
 *      in this plan may ship (dispatcher flag, etc.) until this assertion
 *      passes on prod.
 *
 * Charset handling: utf8mb4 / utf8mb4_unicode_ci is HARDCODED on purpose.
 * payload_text stores customer messages containing emoji, and the older
 * tables in this schema are not reliably utf8mb4 (prod's whatsapp templates
 * already store "?" where an emoji should be), so copying a sibling table's
 * charset would mangle every emoji. The VARCHAR(190) unique key is 760 bytes
 * under utf8mb4, within the InnoDB index limit.
 *
 * Does NOT use drizzle-kit push (documented hang against this remote —
 * CLAUDE.md "MariaDB 10.11 gotchas").
 *
 * Run (dev):
 *   node scripts/whatsapp-outbox-migrate.cjs --dry-run
 *   node scripts/whatsapp-outbox-migrate.cjs
 * Run (prod, human-approved step — DO NOT run from an agent):
 *   node scripts/whatsapp-outbox-migrate.cjs --expect-db=ninjaz_3dnp
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
// Env loader (mirrors phase21-migrate.cjs pattern — no dotenv-cli dependency)
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
// INFORMATION_SCHEMA helpers (idempotent guards) — always keyed off the
// LIVE `SELECT DATABASE()` value, never off env-derived names.
// ---------------------------------------------------------------------------
async function tableExists(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName],
  );
  return rows.length > 0;
}

async function indexExists(conn, dbName, tableName, indexName) {
  const [rows] = await conn.query(
    `SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, tableName, indexName],
  );
  return rows.length > 0;
}

function buildDdl() {
  return `
    CREATE TABLE \`whatsapp_outbox\` (
      \`id\`                 VARCHAR(36)   NOT NULL,
      \`idempotency_key\`    VARCHAR(190)  NOT NULL,
      \`event_key\`          VARCHAR(64)   NOT NULL,
      \`order_id\`           VARCHAR(36)   NULL,
      \`recipient\`          VARCHAR(32)   NOT NULL,
      \`payload_kind\`       ENUM('text','invoice_pdf') NOT NULL DEFAULT 'text',
      \`payload_text\`       TEXT          NULL,
      \`payload_ref\`        VARCHAR(36)   NULL,
      \`status\`             ENUM('queued','sending','accepted','server_ack','delivered','read','failed_retryable','failed_final','undelivered','cancelled') NOT NULL DEFAULT 'queued',
      \`attempts\`           INT           NOT NULL DEFAULT 0,
      \`next_attempt_at\`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`claimed_at\`         TIMESTAMP     NULL,
      \`claimed_by\`         VARCHAR(64)   NULL,
      \`last_error\`         VARCHAR(500)  NULL,
      \`last_http_status\`   INT           NULL,
      \`provider_key_id\`    VARCHAR(128)  NULL,
      \`ack_status\`         VARCHAR(16)   NULL,
      \`ack_rank\`           TINYINT       NOT NULL DEFAULT -1,
      \`acked_at\`           TIMESTAMP     NULL,
      \`sent_at\`            TIMESTAMP     NULL,
      \`created_at\`         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\`         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_outbox_idem\` (\`idempotency_key\`),
      UNIQUE KEY \`uq_outbox_provider_key\` (\`provider_key_id\`),
      KEY \`idx_outbox_drain\` (\`status\`, \`next_attempt_at\`),
      KEY \`idx_outbox_order\` (\`order_id\`),
      KEY \`idx_outbox_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[outbox-migrate] DATABASE_URL not set");

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

    console.log(`[outbox-migrate] connected to ${liveDbName}`);

    // Step 3 — loud warning if DB_NAME disagrees with reality.
    if (process.env.DB_NAME && process.env.DB_NAME !== liveDbName) {
      console.warn(
        `[outbox-migrate] WARNING: DB_NAME=${process.env.DB_NAME} but connected to ${liveDbName} — ignoring DB_NAME`,
      );
    }
    if (dbNameFallback && dbNameFallback !== liveDbName) {
      console.warn(
        `[outbox-migrate] WARNING: DATABASE_URL path implies "${dbNameFallback}" but SELECT DATABASE() reports "${liveDbName}" — using "${liveDbName}"`,
      );
    }

    // Step 4 — --expect-db guard.
    if (args.expectDb && args.expectDb !== liveDbName) {
      console.error(
        `[outbox-migrate] FATAL: --expect-db=${args.expectDb} but connected to ${liveDbName}. Aborting.`,
      );
      process.exitCode = 1;
      return;
    }

    const dbName = liveDbName;

    const ddl = buildDdl();

    if (args.dryRun) {
      console.log("[outbox-migrate] --dry-run: would execute the following DDL:");
      console.log(ddl);
      console.log("[outbox-migrate] --dry-run: no changes made.");
      return;
    }

    const exists = await tableExists(conn, dbName, "whatsapp_outbox");
    if (!exists) {
      console.log("[outbox-migrate] Creating whatsapp_outbox table...");
      await conn.query(ddl);
      console.log("[outbox-migrate] ✓ whatsapp_outbox table created");
    } else {
      console.log("[outbox-migrate] ⊘ whatsapp_outbox already exists — skipping CREATE");
    }

    // Verification — SHOW CREATE TABLE for byte-alignment audit.
    console.log("\n[outbox-migrate] --- SHOW CREATE TABLE whatsapp_outbox ---");
    const [createRows] = await conn.query("SHOW CREATE TABLE `whatsapp_outbox`");
    console.log(createRows[0]["Create Table"]);

    // Required assertion — nothing else in this plan may ship until this
    // passes on prod.
    const hasUniqueIdx = await indexExists(conn, dbName, "whatsapp_outbox", "uq_outbox_idem");
    if (!hasUniqueIdx) {
      console.error(
        "[outbox-migrate] FATAL: uq_outbox_idem is missing from whatsapp_outbox. The idempotency guarantee (D-4) is NOT in place. Aborting.",
      );
      process.exitCode = 1;
      return;
    }
    console.log("[outbox-migrate] ✓ uq_outbox_idem verified present");
    console.log("[outbox-migrate] OK: whatsapp_outbox schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[outbox-migrate] FATAL:", err.message || err);
  process.exitCode = 1;
});
