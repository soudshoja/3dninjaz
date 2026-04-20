/* eslint-disable no-console */
/**
 * Phase 8 (08-01) — Category + Subcategory hierarchy.
 *
 * Raw-SQL path (drizzle-kit push hangs against the cPanel MariaDB host — see
 * phase7-migrate.cjs and CLAUDE.md quirks). Idempotent: every CREATE uses
 * IF NOT EXISTS; every ALTER checks INFORMATION_SCHEMA before applying.
 *
 * Changes:
 *   1. categories        ADD COLUMN position INT NOT NULL DEFAULT 0
 *   2. categories        ADD COLUMN updated_at TIMESTAMP ... ON UPDATE CURRENT_TIMESTAMP
 *   3. subcategories     CREATE TABLE (id, category_id FK CASCADE, slug, name, position, timestamps)
 *   4. products          ADD COLUMN subcategory_id VARCHAR(36) NULL + KEY + FK ON DELETE SET NULL
 *   5. backfill          for each existing category create "General" subcategory,
 *                        repoint every product that has category_id but no subcategory_id.
 *
 * We keep products.category_id intact — it will be retired in a later phase
 * once nav/filters fully switch over (see CLAUDE.md and 08-01 plan notes).
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

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

async function columnExists(conn, dbName, table, col) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, col],
  );
  return rows.length > 0;
}

async function tableExists(conn, dbName, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table],
  );
  return rows.length > 0;
}

async function addCategoryColumns(conn, dbName) {
  if (!(await columnExists(conn, dbName, "categories", "position"))) {
    await conn.query(
      `ALTER TABLE \`categories\` ADD COLUMN \`position\` INT NOT NULL DEFAULT 0`,
    );
    console.log("applied categories.position");
  } else {
    console.log("skip categories.position");
  }

  if (!(await columnExists(conn, dbName, "categories", "updated_at"))) {
    await conn.query(
      `ALTER TABLE \`categories\` ADD COLUMN \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    );
    console.log("applied categories.updated_at");
  } else {
    console.log("skip categories.updated_at");
  }
}

async function createSubcategories(conn, dbName) {
  if (await tableExists(conn, dbName, "subcategories")) {
    console.log("skip table subcategories");
    return;
  }
  // latin1 to match the existing categories/products charset on this DB
  // (SHOW CREATE TABLE categories confirms latin1_swedish_ci).
  await conn.query(`
    CREATE TABLE \`subcategories\` (
      \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
      \`category_id\` VARCHAR(36) NOT NULL,
      \`slug\` VARCHAR(120) NOT NULL,
      \`name\` VARCHAR(120) NOT NULL,
      \`position\` INT NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_subcategory_slug\` (\`category_id\`, \`slug\`),
      KEY \`idx_subcategory_category\` (\`category_id\`),
      CONSTRAINT \`fk_subcategory_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1
  `);
  console.log("applied table subcategories");
}

async function addProductSubcategory(conn, dbName) {
  if (!(await columnExists(conn, dbName, "products", "subcategory_id"))) {
    await conn.query(
      `ALTER TABLE \`products\` ADD COLUMN \`subcategory_id\` VARCHAR(36) NULL AFTER \`category_id\``,
    );
    console.log("applied products.subcategory_id");
  } else {
    console.log("skip products.subcategory_id");
  }

  // Index + FK — check INFORMATION_SCHEMA so a re-run is a no-op.
  const [idxRows] = await conn.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, "products", "idx_products_subcategory"],
  );
  if (idxRows.length === 0) {
    await conn.query(
      `ALTER TABLE \`products\` ADD KEY \`idx_products_subcategory\` (\`subcategory_id\`)`,
    );
    console.log("applied idx_products_subcategory");
  } else {
    console.log("skip idx_products_subcategory");
  }

  const [fkRows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [dbName, "products", "fk_products_subcategory"],
  );
  if (fkRows.length === 0) {
    await conn.query(
      `ALTER TABLE \`products\`
       ADD CONSTRAINT \`fk_products_subcategory\`
       FOREIGN KEY (\`subcategory_id\`) REFERENCES \`subcategories\`(\`id\`) ON DELETE SET NULL`,
    );
    console.log("applied fk_products_subcategory");
  } else {
    console.log("skip fk_products_subcategory");
  }
}

async function backfillDefaultSubcategories(conn) {
  // 1. Ensure every category has a "General" subcategory.
  const [cats] = await conn.query(
    `SELECT id, name, slug FROM categories ORDER BY name`,
  );
  console.log(`found ${cats.length} categories`);

  for (const cat of cats) {
    const [existing] = await conn.query(
      `SELECT id FROM subcategories WHERE category_id = ? AND slug = ?`,
      [cat.id, "general"],
    );
    if (existing.length > 0) {
      console.log(`  skip General for ${cat.name}`);
      continue;
    }
    const subId = randomUUID();
    await conn.query(
      `INSERT INTO subcategories (id, category_id, slug, name, position) VALUES (?, ?, 'general', 'General', 0)`,
      [subId, cat.id],
    );
    console.log(`  created General (${subId}) for ${cat.name}`);
  }

  // 2. Repoint every product that has category_id but no subcategory_id
  //    to its category's "General" subcategory.
  const [unassigned] = await conn.query(
    `SELECT p.id, p.category_id, s.id AS sub_id
     FROM products p
     LEFT JOIN subcategories s ON s.category_id = p.category_id AND s.slug = 'general'
     WHERE p.category_id IS NOT NULL AND p.subcategory_id IS NULL`,
  );
  console.log(`found ${unassigned.length} products to backfill`);
  let updated = 0;
  for (const row of unassigned) {
    if (!row.sub_id) {
      console.warn(`  skip product ${row.id} — no General sub for category ${row.category_id}`);
      continue;
    }
    await conn.query(`UPDATE products SET subcategory_id = ? WHERE id = ?`, [
      row.sub_id,
      row.id,
    ]);
    updated += 1;
  }
  console.log(`backfilled ${updated} products`);
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);

  const dbName = process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`Connected to ${dbName}`);

  try {
    await addCategoryColumns(conn, dbName);
    await createSubcategories(conn, dbName);
    await addProductSubcategory(conn, dbName);
    await backfillDefaultSubcategories(conn);
    console.log("phase8-migrate complete");
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
