/* eslint-disable no-console */
/**
 * Pre-migration backup — snapshots the current SHOW CREATE TABLE output
 * and the full orders row contents as JSON to backups/orders-<timestamp>.json.
 *
 * Use before Phase 9b (ALTER TABLE orders ADD shipping_service_*) so if the
 * migration breaks we can re-add columns from the raw snapshot. mysqldump
 * is not installed on the dev Windows box, so this is the portable path.
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

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);

  const [createRows] = await conn.query("SHOW CREATE TABLE `orders`");
  const createSql =
    createRows[0]?.["Create Table"] ?? createRows[0]?.["CREATE TABLE"] ?? "";

  const [rows] = await conn.query("SELECT * FROM `orders`");
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const dir = path.resolve(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `orders-${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ createSql, rowCount: rows.length, rows }, null, 2),
  );
  console.log(`backup wrote ${rows.length} rows to ${file}`);
  await conn.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
