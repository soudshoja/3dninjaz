/* eslint-disable no-console */
/**
 * Phase 23 (23-01) — tenants + tenant_domains raw-SQL DDL applicator.
 *
 * Idempotent: re-running on a migrated DB produces zero changes (every
 * mutation is gated by an INFORMATION_SCHEMA existence check).
 *
 * Applies two mutations against the PLATFORM database (NOT the tenant DB):
 *   1. CREATE TABLE tenants — registry rows (id, slug, full mysql:// dsn,
 *      status, schema_version, uploads_prefix, primary_domain, settings_json).
 *   2. CREATE TABLE tenant_domains — domain -> tenantId, UNIQUE(domain).
 *
 * Deviations from the phase21-migrate.cjs template (documented in
 * 23-PATTERNS.md § phase23-migrate.cjs):
 *   1. Targets a NEW database via its own env var, PLATFORM_DATABASE_URL —
 *      never DATABASE_URL (the tenant DB). If unset, fails fast with
 *      instructions.
 *   2. The charset probe has no FK parent to read inside a fresh platform
 *      DB, so it opens a SECOND short-lived connection against the
 *      EXISTING tenant DB (DATABASE_URL) and probes `SHOW CREATE TABLE
 *      user` there, then reuses that charset for the platform CREATEs.
 *   3. The platform DB is assumed to ALREADY EXIST (database provisioning is
 *      a documented ops step via cPanel UAPI — the shared app user typically
 *      lacks the privilege to provision new databases — see DEPLOY-NOTES.md).
 *      This script never issues DDL that provisions a database; if the
 *      target DB is unreachable it exits(1) with instructions instead of
 *      trying to create it.
 *
 * Charset handling: DEFAULT CHARSET is NEVER hardcoded. Before any CREATE,
 * this script probes the tenant DB's `user` table (via DATABASE_URL) and
 * reuses that live charset for both new platform tables, per CLAUDE.md's
 * MariaDB gotcha and this repo's established precedent (phase21-migrate.cjs,
 * caveman-option46-migrate.cjs).
 *
 * Run: node scripts/phase23-migrate.cjs
 *   (reads .env.local automatically via loadEnv() — no dotenv-cli required)
 *
 * NB: this repo's cPanel-hosted MariaDB remote does not tolerate the
 * schema-push CLI tool from the Drizzle toolchain (documented hang —
 * CLAUDE.md "MariaDB 10.11 gotchas"). This script's raw mysql2 DDL is the
 * only supported way to apply schema changes against that remote.
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

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
// INFORMATION_SCHEMA helper (idempotent guard)
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

  const platformUrl = process.env.PLATFORM_DATABASE_URL;
  if (!platformUrl) {
    throw new Error(
      "[phase23-migrate] PLATFORM_DATABASE_URL missing — set it in .env.local " +
        "(see DEPLOY-NOTES.md for the UAPI create-database step)",
    );
  }

  const tenantUrl = process.env.DATABASE_URL;
  if (!tenantUrl) {
    throw new Error(
      "[phase23-migrate] DATABASE_URL not set — required to probe the live charset " +
        "from the tenant DB's `user` table",
    );
  }

  const dbName = new URL(platformUrl).pathname.replace(/^\//, "");

  // -------------------------------------------------------------------
  // Charset probe — REQUIRED before any CREATE TABLE. The fresh platform
  // DB has no FK parent of its own to probe, so open a SECOND short-lived
  // connection against the EXISTING tenant DB and reuse its charset.
  // -------------------------------------------------------------------
  console.log("[phase23-migrate] Probing tenant DB `user` table charset...");
  const tenantConn = await mysql.createConnection(tenantUrl);
  let parentCharset;
  try {
    const [userCreateRows] = await tenantConn.query("SHOW CREATE TABLE `user`");
    const userCreateSql = userCreateRows[0]["Create Table"];
    const charsetMatch = userCreateSql.match(/DEFAULT CHARSET=(\w+)/);
    if (!charsetMatch) {
      throw new Error(
        "[phase23-migrate] Could not determine charset from SHOW CREATE TABLE user",
      );
    }
    parentCharset = charsetMatch[1];
    console.log(`[phase23-migrate] Tenant DB charset (user): ${parentCharset}`);
  } finally {
    await tenantConn.end();
  }

  // -------------------------------------------------------------------
  // Connect to the platform DB. The DB is assumed to already exist (a
  // documented ops step via cPanel UAPI) — this script never issues DDL
  // that provisions a database.
  // -------------------------------------------------------------------
  let conn;
  try {
    conn = await mysql.createConnection(platformUrl);
  } catch (err) {
    if (err && (err.code === "ER_BAD_DB_ERROR" || /unknown database/i.test(err.message || ""))) {
      throw new Error(
        `[phase23-migrate] Platform DB ${dbName} does not exist — create it first ` +
          `(DEPLOY-NOTES.md: UAPI Mysql::create_database)`,
      );
    }
    throw err;
  }
  console.log(`[phase23-migrate] connected to ${dbName}`);

  const applied = [];
  const skipped = [];

  try {
    // -------------------------------------------------------------------
    // Mutation 1 — CREATE TABLE tenants
    // -------------------------------------------------------------------
    console.log("[phase23-migrate] Mutation 1 — creating tenants table...");
    if (!(await tableExists(conn, dbName, "tenants"))) {
      await conn.query(`
        CREATE TABLE \`tenants\` (
          \`id\`               VARCHAR(36)  NOT NULL,
          \`name\`             VARCHAR(255) NOT NULL,
          \`slug\`             VARCHAR(128) NOT NULL,
          \`dsn\`              VARCHAR(512) NOT NULL,
          \`status\`           ENUM('active','suspended') NOT NULL DEFAULT 'active',
          \`schema_version\`   INT          NOT NULL DEFAULT 0,
          \`uploads_prefix\`   VARCHAR(255) NOT NULL,
          \`primary_domain\`   VARCHAR(255) NOT NULL,
          \`settings_json\`    LONGTEXT     NULL,
          \`created_at\`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_tenants_slug\` (\`slug\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=${parentCharset}
      `);
      console.log("[phase23-migrate] tenants table created");
      applied.push("tenants table created");
    } else {
      console.log("[phase23-migrate] tenants already exists — skipping");
      skipped.push("tenants");
    }

    // -------------------------------------------------------------------
    // Mutation 2 — CREATE TABLE tenant_domains
    // -------------------------------------------------------------------
    console.log("[phase23-migrate] Mutation 2 — creating tenant_domains table...");
    if (!(await tableExists(conn, dbName, "tenant_domains"))) {
      await conn.query(`
        CREATE TABLE \`tenant_domains\` (
          \`id\`              VARCHAR(36)  NOT NULL,
          \`tenant_id\`       VARCHAR(36)  NOT NULL,
          \`domain\`          VARCHAR(255) NOT NULL,
          \`is_primary\`      TINYINT(1)   NOT NULL DEFAULT 0,
          \`ssl_issued_at\`   TIMESTAMP    NULL,
          \`created_at\`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_tenant_domains_domain\` (\`domain\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=${parentCharset}
      `);
      console.log("[phase23-migrate] tenant_domains table created");
      applied.push("tenant_domains table created");
    } else {
      console.log("[phase23-migrate] tenant_domains already exists — skipping");
      skipped.push("tenant_domains");
    }

    // -------------------------------------------------------------------
    // Verification — SHOW CREATE TABLE for byte-alignment audit
    // -------------------------------------------------------------------
    console.log("\n[phase23-migrate] --- SHOW CREATE TABLE tenants ---");
    const [tenantsCreate] = await conn.query("SHOW CREATE TABLE `tenants`");
    console.log(tenantsCreate[0]["Create Table"]);

    console.log("\n[phase23-migrate] --- SHOW CREATE TABLE tenant_domains ---");
    const [domainsCreate] = await conn.query("SHOW CREATE TABLE `tenant_domains`");
    console.log(domainsCreate[0]["Create Table"]);

    // -------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------
    console.log("\n[phase23-migrate] ========== SUMMARY ==========");
    console.log(`  Applied  (${applied.length}): ${applied.join(", ") || "none"}`);
    console.log(`  Skipped  (${skipped.length}): ${skipped.join(", ") || "none"}`);
    console.log("[phase23-migrate] OK: Phase 23 platform schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[phase23-migrate] FATAL:", err.message || err);
  process.exit(1);
});
