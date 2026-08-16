/* eslint-disable no-console */
/**
 * Phase 20 (20-02) — Order status enum extension + payment_method + store_settings bank
 * columns + payment_proofs table raw-SQL DDL applicator.
 *
 * Idempotent: re-running on a migrated DB produces zero changes (every
 * mutation is gated by an INFORMATION_SCHEMA existence check or catch on
 * ER_DUP_FIELDNAME / ER_TABLE_EXISTS_ERROR).
 *
 * Applies five mutations:
 *   1. ALTER orders.status ENUM extended to 8 values (pending, awaiting_customer,
 *      awaiting_payment_review, paid, processing, shipped, delivered, cancelled)
 *      D-19: MODIFY COLUMN is naturally idempotent — same enum list is a no-op.
 *   2. ALTER orders ADD COLUMN payment_method ENUM('paypal','bank_transfer') NULL
 *      D-21: skip on ER_DUP_FIELDNAME.
 *   3. UPDATE orders SET payment_method='paypal' WHERE paypal_capture_id IS NOT NULL
 *      AND payment_method IS NULL (back-fill existing PayPal orders)
 *   4. ALTER store_settings ADD COLUMN bank_name / bank_account_number /
 *      bank_account_holder / draft_link_template — each skipped on ER_DUP_FIELDNAME.
 *   5. CREATE TABLE payment_proofs per D-22 shape with ENGINE=InnoDB CHARSET=latin1
 *      (must match `orders` charset for FK constraint). Skip on ER_TABLE_EXISTS_ERROR.
 *
 * Run: node scripts/phase20-migrate.cjs
 *   (reads .env.local automatically via loadEnv() — no dotenv-cli required)
 *
 * NB: do NOT run drizzle-kit push against the cPanel remote — it hangs.
 * (CLAUDE.md "MariaDB 10.11 gotchas" rule.)
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

// ---------------------------------------------------------------------------
// Env loader (mirrors phase18/phase19 pattern — no dotenv-cli dependency)
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

  const url =
    process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("[phase20-migrate] DATABASE_URL not set");

  const conn = await mysql.createConnection(url);
  const dbName =
    new URL(url).pathname.replace(/^\//, "") || process.env.DB_NAME;
  console.log(`[phase20-migrate] connected to ${dbName}`);

  const applied = [];
  const skipped = [];

  try {
    // -------------------------------------------------------------------
    // Mutation 1 — orders.status ENUM extension to 8 values
    // D-19: MODIFY COLUMN is idempotent — re-running with identical enum
    // list is a no-op in MariaDB. Always execute; no existence guard needed.
    // -------------------------------------------------------------------
    console.log(
      "[phase20-migrate] Mutation 1 — extending orders.status ENUM to 8 values...",
    );
    await conn.query(
      `ALTER TABLE \`orders\` MODIFY COLUMN \`status\` ENUM(
        'pending',
        'awaiting_customer',
        'awaiting_payment_review',
        'paid',
        'processing',
        'shipped',
        'delivered',
        'cancelled'
      ) NOT NULL DEFAULT 'pending'`,
    );
    console.log("[phase20-migrate] ✓ orders.status ENUM extended (or already current)");
    applied.push("orders.status ENUM extended");

    // -------------------------------------------------------------------
    // Mutation 2 — orders.payment_method ENUM('paypal','bank_transfer') NULL
    // D-21: nullable so legacy rows remain NULL until back-filled or set.
    // Skip on ER_DUP_FIELDNAME (column already exists from a prior run).
    // -------------------------------------------------------------------
    console.log(
      "[phase20-migrate] Mutation 2 — adding orders.payment_method column...",
    );
    if (!(await columnExists(conn, dbName, "orders", "payment_method"))) {
      await conn.query(
        `ALTER TABLE \`orders\` ADD COLUMN \`payment_method\` ENUM('paypal','bank_transfer') NULL DEFAULT NULL`,
      );
      console.log("[phase20-migrate] ✓ orders.payment_method added");
      applied.push("orders.payment_method added");
    } else {
      console.log("[phase20-migrate] ⊘ orders.payment_method already exists — skipping");
      skipped.push("orders.payment_method");
    }

    // -------------------------------------------------------------------
    // Mutation 3 — Back-fill payment_method='paypal' for existing orders
    // D-21: existing PayPal-captured orders have paypal_capture_id set.
    // Safe to re-run (WHERE payment_method IS NULL prevents double-write).
    // -------------------------------------------------------------------
    console.log(
      "[phase20-migrate] Mutation 3 — back-filling payment_method='paypal' for captured PayPal orders...",
    );
    const [backFillResult] = await conn.query(
      `UPDATE \`orders\` SET \`payment_method\` = 'paypal'
       WHERE \`paypal_capture_id\` IS NOT NULL AND \`payment_method\` IS NULL`,
    );
    console.log(
      `[phase20-migrate] ✓ payment_method back-fill complete (${backFillResult.affectedRows} rows updated)`,
    );
    applied.push(`payment_method back-fill (${backFillResult.affectedRows} rows)`);

    // -------------------------------------------------------------------
    // Mutation 4 — store_settings: 4 new columns
    // Each uses INFORMATION_SCHEMA guard to stay idempotent.
    // -------------------------------------------------------------------
    console.log(
      "[phase20-migrate] Mutation 4 — adding store_settings bank + template columns...",
    );

    const storeSettingsCols = [
      {
        name: "bank_name",
        ddl: "`bank_name` VARCHAR(100) NULL DEFAULT NULL",
      },
      {
        name: "bank_account_number",
        ddl: "`bank_account_number` VARCHAR(50) NULL DEFAULT NULL",
      },
      {
        name: "bank_account_holder",
        ddl: "`bank_account_holder` VARCHAR(200) NULL DEFAULT NULL",
      },
      {
        name: "draft_link_template",
        ddl: "`draft_link_template` LONGTEXT NULL DEFAULT NULL",
      },
    ];

    for (const col of storeSettingsCols) {
      if (
        !(await columnExists(conn, dbName, "store_settings", col.name))
      ) {
        await conn.query(
          `ALTER TABLE \`store_settings\` ADD COLUMN ${col.ddl}`,
        );
        console.log(`[phase20-migrate] ✓ store_settings.${col.name} added`);
        applied.push(`store_settings.${col.name} added`);
      } else {
        console.log(
          `[phase20-migrate] ⊘ store_settings.${col.name} already exists — skipping`,
        );
        skipped.push(`store_settings.${col.name}`);
      }
    }

    // -------------------------------------------------------------------
    // Mutation 5 — CREATE TABLE payment_proofs
    // D-22: charset latin1 to match `orders` table for FK constraint.
    // id CHAR(36): app-generated UUIDs (CLAUDE.md MariaDB quirk).
    // Skip on ER_TABLE_EXISTS_ERROR (table already exists from a prior run).
    // -------------------------------------------------------------------
    console.log(
      "[phase20-migrate] Mutation 5 — creating payment_proofs table...",
    );
    if (!(await tableExists(conn, dbName, "payment_proofs"))) {
      await conn.query(`
        CREATE TABLE \`payment_proofs\` (
          \`id\`                   CHAR(36)      NOT NULL,
          \`order_id\`             CHAR(36)      NOT NULL,
          \`image_url\`            VARCHAR(500)  NOT NULL,
          \`thumbnail_url\`        VARCHAR(500)  NULL,
          \`mime_type\`            VARCHAR(64)   NOT NULL,
          \`size_bytes\`           INT           NOT NULL,
          \`uploaded_by\`          ENUM('customer','admin') NOT NULL,
          \`uploaded_by_user_id\`  CHAR(36)      NULL,
          \`status\`               ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          \`admin_note\`           TEXT          NULL,
          \`reviewed_by\`          CHAR(36)      NULL,
          \`reviewed_at\`          DATETIME      NULL,
          \`created_at\`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          CONSTRAINT \`fk_pp_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE,
          KEY \`idx_pp_order_status\` (\`order_id\`, \`status\`),
          KEY \`idx_pp_status_created\` (\`status\`, \`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1
      `);
      console.log("[phase20-migrate] ✓ payment_proofs table created");
      applied.push("payment_proofs table created");
    } else {
      console.log("[phase20-migrate] ⊘ payment_proofs table already exists — skipping");
      skipped.push("payment_proofs");
    }

    // -------------------------------------------------------------------
    // Verification — SHOW CREATE TABLE for byte-alignment audit
    // -------------------------------------------------------------------
    console.log("\n[phase20-migrate] --- SHOW CREATE TABLE orders ---");
    const [ordersCreate] = await conn.query("SHOW CREATE TABLE `orders`");
    console.log(ordersCreate[0]["Create Table"]);

    console.log("\n[phase20-migrate] --- SHOW CREATE TABLE store_settings ---");
    const [ssCreate] = await conn.query("SHOW CREATE TABLE `store_settings`");
    console.log(ssCreate[0]["Create Table"]);

    console.log("\n[phase20-migrate] --- SHOW CREATE TABLE payment_proofs ---");
    const [ppCreate] = await conn.query("SHOW CREATE TABLE `payment_proofs`");
    console.log(ppCreate[0]["Create Table"]);

    // -------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------
    console.log("\n[phase20-migrate] ========== SUMMARY ==========");
    console.log(`  Applied  (${applied.length}): ${applied.join(", ") || "none"}`);
    console.log(`  Skipped  (${skipped.length}): ${skipped.join(", ") || "none"}`);
    console.log("[phase20-migrate] OK: Phase 20 schema applied");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("[phase20-migrate] FATAL:", err.message || err);
  process.exit(1);
});
