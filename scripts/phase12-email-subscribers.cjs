/* eslint-disable no-console */
/**
 * Phase 12 — Email subscribers table.
 *
 * Creates `email_subscribers` for the storefront footer newsletter form and
 * admin `/admin/subscribers` queue. Idempotent — every CREATE/ALTER checks
 * INFORMATION_SCHEMA first so re-running is a no-op.
 *
 * MariaDB quirks (CLAUDE.md):
 *   - App-generated UUIDs on INSERT (so we match the pattern used by other
 *     phase tables) — no SQL UUID() default here.
 *   - ENUM for status — plain VARCHAR would also work but Drizzle's
 *     mysqlEnum maps cleanly onto ENUM.
 *   - Indexes on status + subscribed_at keep the admin list fast as the
 *     subscriber base grows.
 *
 * Table shape mirrors src/lib/db/schema.ts :: emailSubscribers.
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
    if (await tableExists(conn, dbName, "email_subscribers")) {
      console.log("skip email_subscribers (already exists)");
    } else {
      await conn.query(`
        CREATE TABLE \`email_subscribers\` (
          \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
          \`email\` VARCHAR(254) NOT NULL,
          \`source\` VARCHAR(50) DEFAULT NULL,
          \`user_id\` VARCHAR(36) DEFAULT NULL,
          \`status\` ENUM('active','unsubscribed','bounced') NOT NULL DEFAULT 'active',
          \`unsubscribe_token\` VARCHAR(64) DEFAULT NULL,
          \`subscribed_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`unsubscribed_at\` TIMESTAMP NULL DEFAULT NULL,
          \`last_email_sent_at\` TIMESTAMP NULL DEFAULT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY \`uq_email_subscribers_email\` (\`email\`),
          UNIQUE KEY \`uq_email_subscribers_token\` (\`unsubscribe_token\`),
          KEY \`idx_email_subscribers_status\` (\`status\`),
          KEY \`idx_email_subscribers_subscribed_at\` (\`subscribed_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("created email_subscribers");
    }

    // Verify shape
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_subscribers'
       ORDER BY ORDINAL_POSITION`,
      [dbName],
    );
    console.log("verify columns:");
    for (const r of rows) {
      console.log(
        `  ${r.COLUMN_NAME.padEnd(20)} ${String(r.COLUMN_TYPE).padEnd(40)} null=${r.IS_NULLABLE} default=${JSON.stringify(r.COLUMN_DEFAULT)}`,
      );
    }
    console.log("phase12-email-subscribers complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
