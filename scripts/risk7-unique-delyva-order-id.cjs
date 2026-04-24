/* eslint-disable no-console */
/**
 * Risk-7 — add UNIQUE constraint on order_shipments.delyva_order_id.
 *
 * CLAUDE.md claims the constraint exists; schema audit found it missing.
 * Current webhook path uses .update(...where(eq(delyvaOrderId))) only, so
 * this is defensive (prevents future insert races). Before adding, rule out
 * duplicates — if any exist, abort and print offending rows for human review.
 *
 * Idempotent: INFORMATION_SCHEMA guard on constraint existence.
 *
 * Usage:
 *   On server — node scripts/risk7-unique-delyva-order-id.cjs
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

async function constraintExists(conn, dbName, table, constraintName) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [dbName, table, constraintName],
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

  console.log(`[risk7] Connected to database: ${dbName}`);

  try {
    const CONSTRAINT = "uq_order_shipments_delyva_order_id";

    const alreadyThere = await constraintExists(
      conn,
      dbName,
      "order_shipments",
      CONSTRAINT,
    );
    if (alreadyThere) {
      console.log(`[risk7] constraint ${CONSTRAINT} already present — skip`);
      return;
    }

    const [dupRows] = await conn.query(
      `SELECT delyva_order_id, COUNT(*) AS cnt
       FROM order_shipments
       WHERE delyva_order_id IS NOT NULL
       GROUP BY delyva_order_id
       HAVING COUNT(*) > 1`,
    );
    if (dupRows.length > 0) {
      console.error(`[risk7] ABORT — duplicate delyva_order_id rows found:`);
      for (const r of dupRows) {
        console.error(`  ${r.delyva_order_id} (${r.cnt} rows)`);
      }
      console.error(`[risk7] resolve duplicates before re-running`);
      process.exitCode = 2;
      return;
    }

    await conn.query(
      `ALTER TABLE \`order_shipments\`
       ADD CONSTRAINT \`${CONSTRAINT}\` UNIQUE (\`delyva_order_id\`)`,
    );
    console.log(`[risk7] added UNIQUE constraint ${CONSTRAINT} — done`);
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error("[risk7] FATAL:", e);
  process.exit(1);
});
