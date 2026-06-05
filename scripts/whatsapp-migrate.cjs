/* eslint-disable no-console */
/**
 * WhatsApp notifications (Evolution API / Baileys) — raw-SQL DDL applicator.
 *
 * Idempotent: re-running on a migrated DB produces zero changes (every
 * mutation is gated by a tableExists() check).
 *
 * Applies two mutations:
 *   1. CREATE TABLE whatsapp_settings (singleton, id='default')
 *   2. CREATE TABLE whatsapp_notifications (one row per event key)
 *
 * Run: node scripts/whatsapp-migrate.cjs
 *   (reads .env.local automatically — no dotenv-cli required)
 *
 * NB: do NOT run drizzle-kit push against the cPanel remote — it hangs.
 * (CLAUDE.md "MariaDB 10.11 gotchas" rule.)
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

// ---------------------------------------------------------------------------
// Env loader (mirrors phase20-migrate pattern — no dotenv-cli dependency)
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
// INFORMATION_SCHEMA helpers (idempotent guards)
// ---------------------------------------------------------------------------
async function tableExists(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  loadEnv();

  const url =
    process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[whatsapp-migrate] DATABASE_URL not set");

  const conn = await mysql.createConnection(url);
  const dbName =
    process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`[whatsapp-migrate] connected to ${dbName}`);

  const applied = [];
  const skipped = [];

  try {
    // -------------------------------------------------------------------
    // Mutation 1 — whatsapp_settings
    // D: charset latin1 to match the rest of the DB.
    // Two TIMESTAMP NULL columns: MariaDB only auto-defaults the FIRST
    // timestamp column unless explicit. Declaring NULL (no default) on
    // last_qr_at / last_connected_at matches the Drizzle nullable timestamps.
    // TINYINT(1) = Drizzle boolean.
    // -------------------------------------------------------------------
    console.log(
      "[whatsapp-migrate] Mutation 1 — creating whatsapp_settings table...",
    );
    if (!(await tableExists(conn, dbName, "whatsapp_settings"))) {
      await conn.query(`
        CREATE TABLE \`whatsapp_settings\` (
          \`id\`                     VARCHAR(36)  NOT NULL DEFAULT 'default',
          \`instance_name\`          VARCHAR(64)  NOT NULL DEFAULT '3dninjaz',
          \`connection_state\`       ENUM('close','connecting','open') NOT NULL DEFAULT 'close',
          \`connected_number\`       VARCHAR(32)  NULL,
          \`last_qr_at\`             TIMESTAMP    NULL,
          \`last_connected_at\`      TIMESTAMP    NULL,
          \`notifications_enabled\`  TINYINT(1)   NOT NULL DEFAULT 0,
          \`updated_at\`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1
      `);
      console.log("[whatsapp-migrate] ✓ whatsapp_settings table created");
      applied.push("whatsapp_settings table created");
    } else {
      console.log("[whatsapp-migrate] ⊘ whatsapp_settings already exists — skipping");
      skipped.push("whatsapp_settings");
    }

    // -------------------------------------------------------------------
    // Mutation 2 — whatsapp_notifications
    // event_key is PK so seed/upsert is naturally idempotent.
    // -------------------------------------------------------------------
    console.log(
      "[whatsapp-migrate] Mutation 2 — creating whatsapp_notifications table...",
    );
    if (!(await tableExists(conn, dbName, "whatsapp_notifications"))) {
      await conn.query(`
        CREATE TABLE \`whatsapp_notifications\` (
          \`event_key\`   VARCHAR(64)  NOT NULL,
          \`enabled\`     TINYINT(1)   NOT NULL DEFAULT 1,
          \`template\`    TEXT         NOT NULL,
          \`updated_at\`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`event_key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1
      `);
      console.log("[whatsapp-migrate] ✓ whatsapp_notifications table created");
      applied.push("whatsapp_notifications table created");
    } else {
      console.log("[whatsapp-migrate] ⊘ whatsapp_notifications already exists — skipping");
      skipped.push("whatsapp_notifications");
    }

    // -------------------------------------------------------------------
    // Verification — SHOW CREATE TABLE for byte-alignment audit
    // -------------------------------------------------------------------
    if (applied.some((s) => s.includes("whatsapp_settings"))) {
      console.log("\n[whatsapp-migrate] --- SHOW CREATE TABLE whatsapp_settings ---");
      const [wsCreate] = await conn.query("SHOW CREATE TABLE `whatsapp_settings`");
      console.log(wsCreate[0]["Create Table"]);
    }

    if (applied.some((s) => s.includes("whatsapp_notifications"))) {
      console.log("\n[whatsapp-migrate] --- SHOW CREATE TABLE whatsapp_notifications ---");
      const [wnCreate] = await conn.query("SHOW CREATE TABLE `whatsapp_notifications`");
      console.log(wnCreate[0]["Create Table"]);
    }

    // -------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------
    console.log("\n[whatsapp-migrate] ========== SUMMARY ==========");
    console.log(`  Applied  (${applied.length}): ${applied.join(", ") || "none"}`);
    console.log(`  Skipped  (${skipped.length}): ${skipped.join(", ") || "none"}`);
    console.log("[whatsapp-migrate] OK: WhatsApp schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[whatsapp-migrate] FATAL:", err.message || err);
  process.exit(1);
});
