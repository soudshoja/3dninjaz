/**
 * Phase 25 (25-01) — Two idempotent DDL steps for the mixed letter+icon keycap
 * feature:
 *
 *   1. Widen product_config_fields.fieldType ENUM to include 'keycapseq'
 *      (appended at the END of the ENUM list — metadata-only in MariaDB 10.11,
 *       no table rebuild / row rewrite).
 *   2. Add order_items.icon_done TINYINT(1) NOT NULL DEFAULT 0 (icon-print tick,
 *      mirrors base_done / clicker_letter_done).
 *
 * Idempotent: each step reads INFORMATION_SCHEMA.COLUMNS first and skips when
 * the target state is already present. Safe to run repeatedly.
 *
 * Dev-first: apply to ninjaz_3dn ONLY in this phase. Prod (ninjaz_3dnp) is a
 * separate gated deploy step, explicitly out of scope here.
 *
 * NEVER `drizzle-kit push` against the remote (it hangs — CLAUDE.md gotcha).
 * Verify with SHOW CREATE TABLE.
 *
 * Run (dev, via 3307 SSH tunnel — see reference_local_dev_db_tunnel):
 *   ssh -N -L 3307:127.0.0.1:3306 root@152.53.86.223   # background
 *   DATABASE_URL="mysql://ninjaz_3dn:<pw>@127.0.0.1:3307/ninjaz_3dn" \
 *     npx tsx scripts/phase25-fieldtype-migrate.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "");

  // --------------------------------------------------------------------------
  // Step 1 — widen product_config_fields.fieldType ENUM to include 'keycapseq'
  // --------------------------------------------------------------------------
  const [enumRows] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "product_config_fields", "fieldType"],
  );
  const enumType = (enumRows as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE ?? "";

  if (enumType.includes("keycapseq")) {
    console.info("[phase25-migrate] step 1 fieldType ENUM already includes keycapseq — no-op:", enumType);
  } else {
    await conn.query(
      "ALTER TABLE product_config_fields " +
        "MODIFY COLUMN fieldType ENUM('text','number','colour','select','textarea','keycapseq') NOT NULL",
    );
    console.info("[phase25-migrate] step 1 fieldType ENUM widened to include keycapseq");
  }

  const [createPcf] = await conn.query("SHOW CREATE TABLE product_config_fields");
  const pcfSql = (createPcf as Record<string, string>[])[0]?.["Create Table"] ?? "";
  const fieldTypeLine = pcfSql
    .split("\n")
    .find((l) => l.includes("`fieldType`"))
    ?.trim();
  console.info("[phase25-migrate] product_config_fields.fieldType =>", fieldTypeLine);

  // --------------------------------------------------------------------------
  // Step 2 — add order_items.icon_done TINYINT(1) NOT NULL DEFAULT 0
  // --------------------------------------------------------------------------
  const [iconRows] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "order_items", "icon_done"],
  );
  const iconExists = (iconRows as { COLUMN_TYPE: string }[]).length > 0;

  if (iconExists) {
    console.info("[phase25-migrate] step 2 order_items.icon_done already exists — no-op");
  } else {
    await conn.query(
      "ALTER TABLE order_items ADD COLUMN icon_done TINYINT(1) NOT NULL DEFAULT 0",
    );
    console.info("[phase25-migrate] step 2 order_items.icon_done column added");
  }

  const [createOi] = await conn.query("SHOW CREATE TABLE order_items");
  const oiSql = (createOi as Record<string, string>[])[0]?.["Create Table"] ?? "";
  const iconDoneLine = oiSql
    .split("\n")
    .find((l) => l.includes("`icon_done`"))
    ?.trim();
  console.info("[phase25-migrate] order_items.icon_done =>", iconDoneLine);

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
