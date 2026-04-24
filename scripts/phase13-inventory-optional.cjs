/* eslint-disable no-console */
/**
 * Phase 13 — Optional per-variant inventory tracking.
 *
 * Design (CLAUDE.md user intent):
 *   Most 3D Ninjaz products are made-to-order (on-demand) — no stock limit.
 *   Some limited-run/pre-printed items may be tracked. The flag is PER-VARIANT.
 *
 *   track_stock = 0 (default) → on-demand; stock column is ignored; never OOS.
 *   track_stock = 1           → track stock; decrement on order; OOS when stock = 0.
 *
 * Migration steps (idempotent — safe to re-run):
 *   1. Attempt backup of product_variants via mysqldump.
 *   2. ADD COLUMN `stock` INT NOT NULL DEFAULT 0 (if not already present).
 *   3. ADD COLUMN `track_stock` TINYINT(1) NOT NULL DEFAULT 0 (if not present).
 *   4. Verify final column list.
 *
 * Existing rows default to track_stock = 0 and stock = 0 — on-demand, never OOS.
 * The existing `in_stock` boolean and `low_stock_threshold` columns are kept
 * untouched for backwards compatibility.
 *
 * MariaDB 10.11 quirks:
 *   - INFORMATION_SCHEMA guard before every ALTER (idempotent).
 *   - No LATERAL joins used here — plain queries only.
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

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing in .env.local");

  const conn = await mysql.createConnection(url);
  const dbName =
    process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");

  console.log(`[phase13] Connected to database: ${dbName}`);

  // ─── 1. Backup ────────────────────────────────────────────────────────────
  const backupDir = path.resolve(__dirname, "..", ".backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupFile = path.join(backupDir, `phase13-product_variants-${stamp}.sql`);

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port || "3306";
    const user = parsed.username;
    const pass = decodeURIComponent(parsed.password);
    const dbNameFromUrl = parsed.pathname.replace(/^\//, "");

    // Use spawnSync with explicit args array — no shell injection risk.
    const result = spawnSync(
      "mysqldump",
      [
        "-h", host,
        "-P", port,
        `-u${user}`,
        `--password=${pass}`,
        "--no-tablespaces",
        dbNameFromUrl,
        "product_variants",
      ],
      { encoding: "utf8" },
    );

    if (result.status === 0 && result.stdout) {
      fs.writeFileSync(backupFile, result.stdout, "utf8");
      const stat = fs.statSync(backupFile);
      console.log(`[phase13] Backup written: ${backupFile} (${stat.size} bytes)`);
    } else {
      console.warn(`[phase13] mysqldump exit ${result.status}: ${result.stderr || "(no stderr)"}`);
      console.warn("[phase13] Continuing — INFORMATION_SCHEMA guards make this idempotent.");
    }
  } catch (err) {
    console.warn(`[phase13] mysqldump unavailable: ${err.message}`);
    console.warn("[phase13] Continuing without file backup.");
  }

  try {
    // ─── 2. Add `stock` column ────────────────────────────────────────────
    const hasStock = await columnExists(conn, dbName, "product_variants", "stock");
    if (hasStock) {
      console.log("[phase13] skip ADD COLUMN stock (already exists)");
    } else {
      // NOTE (Phase 17): depth_cm was dropped in Phase 16-07 (scripts/phase16-drop-dimensions.cjs).
      // This AFTER clause is a no-op on databases where depth_cm no longer exists —
      // MariaDB's AFTER silently falls back to appending. This migration is historical
      // and has already run on all live DBs; kept for archaeological clarity.
      await conn.query(`
        ALTER TABLE \`product_variants\`
        ADD COLUMN \`stock\` INT NOT NULL DEFAULT 0
        AFTER \`depth_cm\`
      `);
      console.log("[phase13] ADD COLUMN stock INT NOT NULL DEFAULT 0 — done");
    }

    // ─── 3. Add `track_stock` column ─────────────────────────────────────
    const hasTrackStock = await columnExists(conn, dbName, "product_variants", "track_stock");
    if (hasTrackStock) {
      console.log("[phase13] skip ADD COLUMN track_stock (already exists)");
    } else {
      await conn.query(`
        ALTER TABLE \`product_variants\`
        ADD COLUMN \`track_stock\` TINYINT(1) NOT NULL DEFAULT 0
        AFTER \`stock\`
      `);
      console.log("[phase13] ADD COLUMN track_stock TINYINT(1) NOT NULL DEFAULT 0 — done");
    }

    // ─── 4. Verify final shape ────────────────────────────────────────────
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'product_variants'
       ORDER BY ORDINAL_POSITION`,
      [dbName],
    );
    console.log("\n[phase13] product_variants columns:");
    for (const c of cols) {
      console.log(
        `  ${String(c.COLUMN_NAME).padEnd(22)} ${String(c.COLUMN_TYPE).padEnd(30)} null=${c.IS_NULLABLE} default=${JSON.stringify(c.COLUMN_DEFAULT)}`,
      );
    }

    // ─── 5. Confirm existing rows default to on-demand ────────────────────
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN track_stock = 1 THEN 1 ELSE 0 END) AS tracking
       FROM \`product_variants\``,
    );
    const { total, tracking } = countRows[0];
    console.log(`\n[phase13] ${total} variants; ${tracking} have track_stock=1 (should be 0 after fresh migration)`);

    console.log("\n[phase13] phase13-inventory-optional complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error("[phase13] FATAL:", e);
  process.exit(1);
});
