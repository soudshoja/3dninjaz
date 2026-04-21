/* eslint-disable no-console */
/**
 * Phase 14 — Cost breakdown: per-variant inputs + store-level defaults.
 *
 * store_settings  (5 new columns):
 *   default_filament_cost_per_kg  DECIMAL(8,2)  NULL  — MYR per kg of filament
 *   default_electricity_cost_per_kwh DECIMAL(8,4) NULL — MYR per kWh
 *   default_electricity_kwh_per_hour DECIMAL(6,3) NULL — printer power (e.g. 0.150 = 150W)
 *   default_labor_rate_per_hour   DECIMAL(8,2)  NULL  — MYR per hour of labor
 *   default_overhead_percent      DECIMAL(5,2)  NOT NULL DEFAULT 0 — % overhead on subtotal
 *
 * product_variants  (7 new columns):
 *   filament_grams          DECIMAL(8,2)   NULL  — grams of filament used
 *   print_time_hours        DECIMAL(6,2)   NULL  — hours of printer time
 *   labor_minutes           DECIMAL(6,1)   NULL  — minutes of labor
 *   other_cost              DECIMAL(10,2)  NULL  — packaging, misc (MYR)
 *   filament_rate_override  DECIMAL(8,2)   NULL  — per-variant filament rate (overrides store default)
 *   labor_rate_override     DECIMAL(8,2)   NULL  — per-variant labor rate (overrides store default)
 *   cost_price_manual       TINYINT(1)     NOT NULL DEFAULT 0
 *     — when 1, cost_price is admin-entered total (breakdown ignored on display)
 *     — when 0, cost_price is auto-computed from breakdown fields
 *
 * Backward compat: existing variants with cost_price IS NOT NULL AND cost_price > 0
 *   are set to cost_price_manual=1 so the hand-entered total stays authoritative
 *   until the admin chooses to fill in the breakdown.
 *
 * Raw-SQL path (drizzle-kit push hangs on cPanel MariaDB — CLAUDE.md).
 * Every ALTER is guarded by INFORMATION_SCHEMA so re-running is a no-op.
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function columnExists(conn, dbName, table, column) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column],
  );
  return rows.length > 0;
}

async function addColumn(conn, dbName, table, col, ddl) {
  if (await columnExists(conn, dbName, table, col)) {
    console.log(`[phase14] skip ${table}.${col} (already exists)`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[phase14] ADD COLUMN ${table}.${col} — done`);
}

async function backup(url, tables) {
  const backupDir = path.resolve(__dirname, "..", ".backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parsed.port || "3306";
  const user = parsed.username;
  const pass = decodeURIComponent(parsed.password);
  const dbName = parsed.pathname.replace(/^\//, "");

  for (const table of tables) {
    const backupFile = path.join(backupDir, `phase14-${table}-${stamp}.sql`);
    try {
      const result = spawnSync(
        "mysqldump",
        [
          "-h", host,
          "-P", port,
          `-u${user}`,
          `--password=${pass}`,
          "--no-tablespaces",
          dbName,
          table,
        ],
        { encoding: "utf8" },
      );

      if (result.status === 0 && result.stdout) {
        fs.writeFileSync(backupFile, result.stdout, "utf8");
        const stat = fs.statSync(backupFile);
        console.log(`[phase14] Backup ${table}: ${backupFile} (${stat.size} bytes)`);
      } else {
        console.warn(`[phase14] mysqldump exit ${result.status}: ${result.stderr || "(no stderr)"}`);
        console.warn("[phase14] Continuing — INFORMATION_SCHEMA guards make this idempotent.");
      }
    } catch (err) {
      console.warn(`[phase14] mysqldump unavailable: ${err.message}`);
      console.warn("[phase14] Continuing without file backup.");
    }
  }
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing in .env.local");

  const conn = await mysql.createConnection(url);
  const dbName =
    process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");

  console.log(`[phase14] Connected to database: ${dbName}`);

  // ─── 1. Backup both tables ────────────────────────────────────────────────
  await backup(url, ["store_settings", "product_variants"]);

  try {
    // =========================================================================
    // store_settings — cost defaults (5 columns)
    // =========================================================================
    await addColumn(conn, dbName, "store_settings", "default_filament_cost_per_kg",
      "`default_filament_cost_per_kg` DECIMAL(8,2) NULL AFTER `sst_rate`");

    await addColumn(conn, dbName, "store_settings", "default_electricity_cost_per_kwh",
      "`default_electricity_cost_per_kwh` DECIMAL(8,4) NULL AFTER `default_filament_cost_per_kg`");

    await addColumn(conn, dbName, "store_settings", "default_electricity_kwh_per_hour",
      "`default_electricity_kwh_per_hour` DECIMAL(6,3) NULL AFTER `default_electricity_cost_per_kwh`");

    await addColumn(conn, dbName, "store_settings", "default_labor_rate_per_hour",
      "`default_labor_rate_per_hour` DECIMAL(8,2) NULL AFTER `default_electricity_kwh_per_hour`");

    await addColumn(conn, dbName, "store_settings", "default_overhead_percent",
      "`default_overhead_percent` DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER `default_labor_rate_per_hour`");

    // =========================================================================
    // product_variants — cost breakdown (7 columns)
    // =========================================================================
    await addColumn(conn, dbName, "product_variants", "filament_grams",
      "`filament_grams` DECIMAL(8,2) NULL AFTER `track_stock`");

    await addColumn(conn, dbName, "product_variants", "print_time_hours",
      "`print_time_hours` DECIMAL(6,2) NULL AFTER `filament_grams`");

    await addColumn(conn, dbName, "product_variants", "labor_minutes",
      "`labor_minutes` DECIMAL(6,1) NULL AFTER `print_time_hours`");

    await addColumn(conn, dbName, "product_variants", "other_cost",
      "`other_cost` DECIMAL(10,2) NULL AFTER `labor_minutes`");

    await addColumn(conn, dbName, "product_variants", "filament_rate_override",
      "`filament_rate_override` DECIMAL(8,2) NULL AFTER `other_cost`");

    await addColumn(conn, dbName, "product_variants", "labor_rate_override",
      "`labor_rate_override` DECIMAL(8,2) NULL AFTER `filament_rate_override`");

    await addColumn(conn, dbName, "product_variants", "cost_price_manual",
      "`cost_price_manual` TINYINT(1) NOT NULL DEFAULT 0 AFTER `labor_rate_override`");

    // =========================================================================
    // Backward compat: mark existing non-null cost_price rows as manual=1
    // so the hand-entered total stays authoritative until admin fills breakdown.
    // =========================================================================
    const [updateResult] = await conn.query(
      `UPDATE \`product_variants\`
       SET cost_price_manual = 1
       WHERE cost_price IS NOT NULL
         AND cost_price > 0
         AND cost_price_manual = 0`,
    );
    const affected = updateResult.affectedRows ?? 0;
    console.log(`[phase14] Marked ${affected} existing cost_price rows as cost_price_manual=1`);

    // ─── Verify final shapes ─────────────────────────────────────────────────
    for (const table of ["store_settings", "product_variants"]) {
      const [cols] = await conn.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [dbName, table],
      );
      console.log(`\n[phase14] ${table} columns:`);
      for (const c of cols) {
        console.log(
          `  ${String(c.COLUMN_NAME).padEnd(32)} ${String(c.COLUMN_TYPE).padEnd(24)} null=${c.IS_NULLABLE} default=${JSON.stringify(c.COLUMN_DEFAULT)}`,
        );
      }
    }

    // ─── Row counts ──────────────────────────────────────────────────────────
    const [[{ total, manual }]] = await conn.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN cost_price_manual = 1 THEN 1 ELSE 0 END) AS manual
       FROM \`product_variants\``,
    );
    console.log(`\n[phase14] product_variants: ${total} rows; ${manual} have cost_price_manual=1`);

    console.log("\n[phase14] phase14-cost-breakdown migration complete.");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error("[phase14] FATAL:", e);
  process.exit(1);
});
