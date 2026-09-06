/* eslint-disable no-console */
/**
 * Phase 21 (21-01) — meshy_generations + meshy_revisions raw-SQL DDL applicator.
 *
 * Idempotent: re-running on a migrated DB produces zero changes (every
 * mutation is gated by an INFORMATION_SCHEMA existence check).
 *
 * Applies two mutations:
 *   1. CREATE TABLE meshy_generations — admin-only Meshy AI Image-to-3D
 *      workflow parent row (one per admin-uploaded reference photo).
 *   2. CREATE TABLE meshy_revisions — retexture/regenerate revision history,
 *      FK generation_id -> meshy_generations(id) ON DELETE CASCADE.
 *
 * Charset handling: DEFAULT CHARSET is NEVER hardcoded. Before any CREATE,
 * this script probes `SHOW CREATE TABLE user` (the FK parent for
 * admin_user_id) and reuses that live charset for both new tables, per
 * CLAUDE.md's MariaDB gotcha and this repo's established precedent
 * (Phase 18 colours migration hit the same rule).
 *
 * Run: node scripts/phase21-migrate.cjs
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
// Env loader (mirrors phase20-migrate.cjs pattern — no dotenv-cli dependency)
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

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[phase21-migrate] DATABASE_URL not set");

  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "") || process.env.DB_NAME;
  console.log(`[phase21-migrate] connected to ${dbName}`);

  const applied = [];
  const skipped = [];

  try {
    // -------------------------------------------------------------------
    // Charset probe — REQUIRED before any CREATE TABLE. Never assume
    // latin1; read it live from the FK parent (`user`, referenced by
    // meshy_generations.admin_user_id).
    // -------------------------------------------------------------------
    console.log("[phase21-migrate] Probing FK-parent (user) charset...");
    const [userCreateRows] = await conn.query("SHOW CREATE TABLE `user`");
    const userCreateSql = userCreateRows[0]["Create Table"];
    const charsetMatch = userCreateSql.match(/DEFAULT CHARSET=(\w+)/);
    if (!charsetMatch) {
      throw new Error(
        "[phase21-migrate] Could not determine charset from SHOW CREATE TABLE user",
      );
    }
    const parentCharset = charsetMatch[1];
    console.log(`[phase21-migrate] FK-parent charset (user): ${parentCharset}`);

    // -------------------------------------------------------------------
    // Mutation 1 — CREATE TABLE meshy_generations
    // -------------------------------------------------------------------
    console.log("[phase21-migrate] Mutation 1 — creating meshy_generations table...");
    if (!(await tableExists(conn, dbName, "meshy_generations"))) {
      await conn.query(`
        CREATE TABLE \`meshy_generations\` (
          \`id\`                          CHAR(36)      NOT NULL,
          \`admin_user_id\`                CHAR(36)      NOT NULL,
          \`product_id\`                   CHAR(36)      NULL,
          \`source_image_path\`            VARCHAR(1024) NOT NULL,
          \`texture_prompt\`               VARCHAR(600)  NULL,
          \`ai_model\`                     VARCHAR(32)   NOT NULL DEFAULT 'meshy-6',
          \`status\`                       ENUM('generating','awaiting_review','revising','analyzing','repairing','processing_multicolor','ready','failed','canceled') NOT NULL DEFAULT 'generating',
          \`meshy_task_id\`                VARCHAR(64)   NULL,
          \`meshy_analyze_task_id\`        VARCHAR(64)   NULL,
          \`meshy_repair_task_id\`         VARCHAR(64)   NULL,
          \`meshy_multicolor_task_id\`     VARCHAR(64)   NULL,
          \`printability_status\`          ENUM('healthy','warning','error','unknown') NULL,
          \`printability_report\`          LONGTEXT      NULL,
          \`is_multi_color\`               TINYINT(1)    NOT NULL DEFAULT 0,
          \`local_thumbnail_path\`         VARCHAR(1024) NULL,
          \`local_model_files\`            LONGTEXT      NULL,
          \`credits_used\`                 INT           NOT NULL DEFAULT 0,
          \`task_error_type\`              VARCHAR(64)   NULL,
          \`task_error_message\`           VARCHAR(512)  NULL,
          \`model_ready_at\`               DATETIME      NULL,
          \`approved_at\`                  DATETIME      NULL,
          \`approved_by\`                  CHAR(36)      NULL,
          \`created_at\`                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\`                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          CONSTRAINT \`fk_mg_admin_user\` FOREIGN KEY (\`admin_user_id\`) REFERENCES \`user\`(\`id\`),
          KEY \`idx_mg_status_updated\` (\`status\`, \`updated_at\`),
          KEY \`idx_mg_created\` (\`created_at\`),
          KEY \`idx_mg_product\` (\`product_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=${parentCharset}
      `);
      console.log("[phase21-migrate] ✓ meshy_generations table created");
      applied.push("meshy_generations table created");
    } else {
      console.log("[phase21-migrate] ⊘ meshy_generations already exists — skipping");
      skipped.push("meshy_generations");
    }

    // -------------------------------------------------------------------
    // Mutation 2 — CREATE TABLE meshy_revisions
    // product_id and approved_by on meshy_generations deliberately carry NO
    // FK constraint (app-layer only, per resolved open question #2 in
    // 21-CONTEXT.md) — meshy_revisions.generation_id DOES carry a real FK
    // since it is a true parent/child relationship within this phase.
    // -------------------------------------------------------------------
    console.log("[phase21-migrate] Mutation 2 — creating meshy_revisions table...");
    if (!(await tableExists(conn, dbName, "meshy_revisions"))) {
      await conn.query(`
        CREATE TABLE \`meshy_revisions\` (
          \`id\`                  CHAR(36)     NOT NULL,
          \`generation_id\`       CHAR(36)     NOT NULL,
          \`revision_number\`     INT          NOT NULL,
          \`endpoint_used\`       ENUM('retexture','regenerate','remesh') NOT NULL,
          \`change_note\`         VARCHAR(1000) NULL,
          \`new_texture_prompt\`  VARCHAR(600)  NULL,
          \`meshy_task_id\`       VARCHAR(64)   NULL,
          \`credits_used\`        INT          NOT NULL DEFAULT 0,
          \`created_at\`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          CONSTRAINT \`fk_mr_generation\` FOREIGN KEY (\`generation_id\`) REFERENCES \`meshy_generations\`(\`id\`) ON DELETE CASCADE,
          KEY \`idx_mr_generation_created\` (\`generation_id\`, \`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=${parentCharset}
      `);
      console.log("[phase21-migrate] ✓ meshy_revisions table created");
      applied.push("meshy_revisions table created");
    } else {
      console.log("[phase21-migrate] ⊘ meshy_revisions already exists — skipping");
      skipped.push("meshy_revisions");
    }

    // -------------------------------------------------------------------
    // Verification — SHOW CREATE TABLE for byte-alignment audit
    // -------------------------------------------------------------------
    console.log("\n[phase21-migrate] --- SHOW CREATE TABLE meshy_generations ---");
    const [mgCreate] = await conn.query("SHOW CREATE TABLE `meshy_generations`");
    console.log(mgCreate[0]["Create Table"]);

    console.log("\n[phase21-migrate] --- SHOW CREATE TABLE meshy_revisions ---");
    const [mrCreate] = await conn.query("SHOW CREATE TABLE `meshy_revisions`");
    console.log(mrCreate[0]["Create Table"]);

    // -------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------
    console.log("\n[phase21-migrate] ========== SUMMARY ==========");
    console.log(`  Applied  (${applied.length}): ${applied.join(", ") || "none"}`);
    console.log(`  Skipped  (${skipped.length}): ${skipped.join(", ") || "none"}`);
    console.log("[phase21-migrate] OK: Phase 21 schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[phase21-migrate] FATAL:", err.message || err);
  process.exit(1);
});
