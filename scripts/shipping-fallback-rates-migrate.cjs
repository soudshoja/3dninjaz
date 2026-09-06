/* eslint-disable no-console */
/**
 * Shipping fallback rates (260906) — raw-SQL DDL applicator + seed.
 *
 * WHY: `shipping_rates.flat_rate` has been 0.00 for all 16 Malaysian states
 * since the 2026-04-19 seed and was never filled in. Every code path that
 * falls back to it therefore charged RM0.00 shipping, silently. A single flat
 * rate per state also cannot be correct — observed Delyva prices for the same
 * state range RM5.00 / 5.60 / 6.30 / 10.50 depending on parcel weight.
 *
 * Creates:
 *   shipping_fallback_rates (state, max_weight_kg, rate, source)
 *     UNIQUE (state, max_weight_kg)
 *
 * Lookup rounds parcel weight UP to the first bracket whose max_weight_kg
 * is >= the weight. `source` is 'seed' here; successful Delyva quotes upsert
 * 'learned' rows at runtime, and admin edits write 'manual' (never
 * overwritten by the learner).
 *
 * Seed basis:
 *   - Peninsular <= 1 kg  = RM5.00   (22x Kuala Lumpur, 35x Selangor observed)
 *   - Peninsular  ~2-3 kg = RM5.60 / RM6.30 (observed Perak, Selangor, KL)
 *   - Peninsular  ~10 kg  = RM10.50 (observed Selangor)
 *   - East MY <= 1 kg     = RM10.90 (5x Sabah, 3x Sarawak observed)
 *   Brackets ABOVE 10 kg are extrapolated, NOT observed — no order that heavy
 *   has shipped yet. Admin should verify them in /admin/shipping.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + INSERT ... ON DUPLICATE KEY UPDATE
 * that only touches rows still marked source='seed'. Re-running never
 * clobbers a learned or admin-edited rate.
 *
 * Run: node scripts/shipping-fallback-rates-migrate.cjs
 *   (reads .env.local automatically)
 *
 * NB: do NOT run drizzle-kit push against the cPanel remote — it hangs.
 */

const mysql = require("mysql2/promise");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

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

// Mirrors MALAYSIAN_STATES in src/lib/validators.ts.
const EAST_MY = ["Sabah", "Sarawak", "Labuan"];
const PENINSULAR = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Selangor",
  "Terengganu",
  "Kuala Lumpur",
  "Putrajaya",
];

// [maxWeightKg, peninsularRate, eastRate]
const BRACKETS = [
  [0.5, "5.00", "10.90"],
  [1.0, "5.00", "10.90"],
  [2.0, "5.60", "13.50"],
  [3.0, "6.30", "16.00"],
  [5.0, "8.00", "21.00"],
  [10.0, "10.50", "32.00"],
  [20.0, "17.00", "55.00"], // extrapolated — verify in /admin/shipping
  [30.0, "24.00", "78.00"], // extrapolated — verify in /admin/shipping
];

async function tableExists(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName],
  );
  return rows.length > 0;
}

async function run() {
  loadEnv();

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) {
    throw new Error("[shipping-fallback-rates] DATABASE_URL not set");
  }

  const conn = await mysql.createConnection(url);

  // Ask the CONNECTION which schema it is on. Do NOT trust process.env.DB_NAME:
  // prod's .env.local carries a stale DB_NAME=ninjaz_3dn (the dev database)
  // while DATABASE_URL points at ninjaz_3dnp. Deriving the name from env makes
  // every INFORMATION_SCHEMA guard inspect the WRONG schema, so the DDL is
  // silently skipped on prod.
  const [dbRows] = await conn.query("SELECT DATABASE() AS db");
  const dbName = dbRows[0] && dbRows[0].db;
  if (!dbName) throw new Error("[shipping-fallback-rates] could not resolve schema");
  console.log(`[shipping-fallback-rates] connected to ${dbName}`);

  const existed = await tableExists(conn, dbName, "shipping_fallback_rates");
  if (existed) {
    console.log("[shipping-fallback-rates] table already present — skipping CREATE");
  } else {
    await conn.query(`
      CREATE TABLE shipping_fallback_rates (
        id VARCHAR(36) NOT NULL DEFAULT (UUID()),
        state VARCHAR(64) NOT NULL,
        max_weight_kg DECIMAL(6,3) NOT NULL,
        rate DECIMAL(10,2) NOT NULL,
        source ENUM('seed','learned','manual') NOT NULL DEFAULT 'seed',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY shipping_fallback_state_bracket (state, max_weight_kg)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[shipping-fallback-rates] created shipping_fallback_rates");
  }

  // Seed. ON DUPLICATE KEY only rewrites rows still marked 'seed' — a learned
  // or admin-edited rate keeps its value (IF() guard on both columns).
  let inserted = 0;
  for (const state of [...PENINSULAR, ...EAST_MY]) {
    const east = EAST_MY.includes(state);
    for (const [maxKg, penRate, eastRate] of BRACKETS) {
      const rate = east ? eastRate : penRate;
      const [res] = await conn.query(
        `INSERT INTO shipping_fallback_rates (id, state, max_weight_kg, rate, source)
         VALUES (?, ?, ?, ?, 'seed')
         ON DUPLICATE KEY UPDATE
           rate = IF(source = 'seed', VALUES(rate), rate),
           source = source`,
        [crypto.randomUUID(), state, maxKg.toFixed(3), rate],
      );
      if (res.affectedRows === 1) inserted += 1;
    }
  }
  console.log(
    `[shipping-fallback-rates] seeded ${inserted} new bracket rows ` +
      `(${PENINSULAR.length + EAST_MY.length} states x ${BRACKETS.length} brackets)`,
  );

  // Legacy shipping_rates: keep it in sync with the <=1 kg bracket so any
  // caller still reading the old flat table stops returning 0.00.
  const [legacy] = await conn.query(
    `SELECT COUNT(*) AS zero_rows FROM shipping_rates WHERE flat_rate = 0.00`,
  );
  if (legacy[0] && Number(legacy[0].zero_rows) > 0) {
    for (const state of [...PENINSULAR, ...EAST_MY]) {
      const rate = EAST_MY.includes(state) ? "10.90" : "5.00";
      await conn.query(
        `UPDATE shipping_rates SET flat_rate = ? WHERE state = ? AND flat_rate = 0.00`,
        [rate, state],
      );
    }
    console.log(
      `[shipping-fallback-rates] backfilled ${legacy[0].zero_rows} zeroed shipping_rates rows`,
    );
  } else {
    console.log("[shipping-fallback-rates] shipping_rates has no zeroed rows — left alone");
  }

  await conn.end();
  console.log("[shipping-fallback-rates] done");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
