/* eslint-disable no-console */
/**
 * Accounting v2 - additive raw-SQL migration.
 *
 * Adds: expenses v2 columns + widened enums, assets v2 columns, new tables
 * asset_payments + income_entries, payouts.from_account + widened paid_into,
 * orders.payment_method widened, order_items.unit_cost_source, products cost
 * columns, and two idempotent data fixes. See ACCOUNTING_V2_PLAN.md
 * ("Data model"). Mirrored in src/lib/db/schema.ts.
 *
 * Idempotent: every ADD COLUMN / ADD KEY / CREATE TABLE is gated by an
 * INFORMATION_SCHEMA check; every enum MODIFY only runs when the live
 * COLUMN_TYPE differs from the target value list (and aborts if the live
 * column holds a value the target would drop). The two UPDATEs are
 * self-limiting (their WHERE clauses stop matching once applied).
 *
 * DB_NAME trap (see project memory "Migration DB_NAME trap"): prod's
 * `.env.local` can carry DB_NAME=ninjaz_3dn (the DEV schema) while
 * DATABASE_URL points at ninjaz_3dnp. This script therefore NEVER trusts
 * DB_NAME: `SELECT DATABASE()` on the live connection is the only authority
 * for every INFORMATION_SCHEMA guard, and `--expect-db=<name>` aborts on
 * mismatch.
 *
 * Does NOT use drizzle-kit push (hangs against the remote).
 *
 * Run (dev):
 *   node scripts/accounting-v2-migrate.cjs --dry-run --expect-db=ninjaz_3dn
 *   node scripts/accounting-v2-migrate.cjs --expect-db=ninjaz_3dn
 * Prod is a separate, human-approved step:
 *   node scripts/accounting-v2-migrate.cjs --expect-db=ninjaz_3dnp
 */

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

const TAG = "[acct-v2-migrate]";

function parseArgs(argv) {
  const args = { dryRun: false, expectDb: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--expect-db=")) args.expectDb = arg.slice("--expect-db=".length);
  }
  return args;
}

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
// Guards - always keyed off the LIVE SELECT DATABASE() value.
// ---------------------------------------------------------------------------
async function tableExists(conn, db, table) {
  const [rows] = await conn.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
    [db, table],
  );
  return rows.length > 0;
}

async function columnType(conn, db, table, column) {
  const [rows] = await conn.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column],
  );
  return rows.length ? String(rows[0].COLUMN_TYPE) : null;
}

async function indexExists(conn, db, table, index) {
  const [rows] = await conn.query(
    `SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, table, index],
  );
  return rows.length > 0;
}

function enumType(values) {
  return `enum(${values.map((v) => `'${v}'`).join(",")})`;
}

function parseEnumValues(colType) {
  const m = /^enum\((.*)\)$/i.exec(colType);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

// ---------------------------------------------------------------------------
// Target enum value lists
// ---------------------------------------------------------------------------
const ACCOUNTS = ["paypal", "bank", "cash", "credit_card"];
const BANK_MATCH = ["unchecked", "matched", "check", "not_found"];
const EXPENSE_CATEGORIES = [
  "materials",
  "utilities",
  "marketing",
  "shipping",
  "equipment",
  "other",
  "packaging",
  "consumables",
  "design",
  "fees",
];
const PAID_INTO = ["bank", "cash", "credit_card", "paypal"];
const PAYMENT_METHODS = ["paypal", "bank_transfer", "cash", "other"];

const q = (v) => `'${v}'`;
const list = (a) => a.map(q).join(",");

// ---------------------------------------------------------------------------
// Step builders. Each step: { desc, needed(conn, db) -> bool, sql }
// ---------------------------------------------------------------------------
function enumModify(table, column, target, tail, desc) {
  return {
    desc: desc || `MODIFY ${table}.${column} -> ${enumType(target)}`,
    async needed(conn, db) {
      const cur = await columnType(conn, db, table, column);
      if (cur === null) throw new Error(`${table}.${column} does not exist`);
      if (cur.toLowerCase() === enumType(target)) return false;
      const curVals = parseEnumValues(cur);
      if (!curVals) throw new Error(`${table}.${column} is not an enum (${cur})`);
      const dropped = curVals.filter((v) => !target.includes(v));
      if (dropped.length) {
        throw new Error(
          `${table}.${column} holds values the target would drop: ${dropped.join(",")}. Aborting.`,
        );
      }
      return true;
    },
    sql: `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${list(target)}) ${tail}`,
  };
}

function addColumn(table, column, definition) {
  return {
    desc: `ADD COLUMN ${table}.${column}`,
    async needed(conn, db) {
      return (await columnType(conn, db, table, column)) === null;
    },
    sql: `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
  };
}

function addUnique(table, name, cols) {
  return {
    desc: `ADD UNIQUE KEY ${table}.${name}`,
    async needed(conn, db) {
      return !(await indexExists(conn, db, table, name));
    },
    sql: `ALTER TABLE \`${table}\` ADD UNIQUE KEY \`${name}\` (${cols})`,
  };
}

function addKey(table, name, cols) {
  return {
    desc: `ADD KEY ${table}.${name}`,
    async needed(conn, db) {
      return !(await indexExists(conn, db, table, name));
    },
    sql: `ALTER TABLE \`${table}\` ADD KEY \`${name}\` (${cols})`,
  };
}

function createTable(table, ddl, buildSql) {
  return {
    desc: `CREATE TABLE ${table}`,
    async needed(conn, db) {
      return !(await tableExists(conn, db, table));
    },
    sql: ddl,
    // Optional: build the real SQL from the live schema (collation-dependent FKs).
    buildSql,
  };
}

/** Live charset + collation of a column, as a "CHARACTER SET x COLLATE y" fragment. */
async function columnCharset(conn, db, table, column) {
  const [rows] = await conn.query(
    `SELECT CHARACTER_SET_NAME AS cs, COLLATION_NAME AS co FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column],
  );
  if (!rows.length || !rows[0].cs || !rows[0].co) {
    throw new Error(`cannot read the charset of ${table}.${column}`);
  }
  // Values come from INFORMATION_SCHEMA, but still refuse anything odd.
  if (!/^[a-z0-9_]+$/i.test(rows[0].cs) || !/^[a-z0-9_]+$/i.test(rows[0].co)) {
    throw new Error(`unexpected charset on ${table}.${column}`);
  }
  return `CHARACTER SET ${rows[0].cs} COLLATE ${rows[0].co}`;
}

const productOptionCostsSql = (idCharset) => `CREATE TABLE \`product_option_costs\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`product_id\` VARCHAR(36) ${idCharset} NOT NULL,
        \`field_id\` VARCHAR(36) ${idCharset} NOT NULL,
        \`option_value\` VARCHAR(150) NOT NULL,
        \`cost_price\` DECIMAL(10,2) NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_product_option_costs_option\` (\`product_id\`, \`field_id\`, \`option_value\`),
        KEY \`idx_product_option_costs_product\` (\`product_id\`),
        CONSTRAINT \`fk_product_option_costs_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

function buildSteps() {
  const steps = [];

  // --- expenses: widen enums first (all-additive), then columns ---
  steps.push(
    enumModify("expenses", "category", EXPENSE_CATEGORIES, "NOT NULL"),
    enumModify("expenses", "paid_from", ACCOUNTS, "NOT NULL DEFAULT 'bank'"),
    addColumn("expenses", "subcategory", "VARCHAR(64) NULL AFTER `category`"),
    addColumn("expenses", "via_paypal", "TINYINT(1) NOT NULL DEFAULT 0 AFTER `paid_from`"),
    addColumn("expenses", "currency", "VARCHAR(3) NOT NULL DEFAULT 'MYR'"),
    addColumn("expenses", "amount_original", "DECIMAL(12,2) NULL"),
    addColumn("expenses", "fx_rate", "DECIMAL(14,8) NULL"),
    addColumn("expenses", "project_tag", "VARCHAR(64) NULL"),
    addColumn("expenses", "bank_match", `ENUM(${list(BANK_MATCH)}) NOT NULL DEFAULT 'unchecked'`),
    addColumn("expenses", "bank_amount", "DECIMAL(10,2) NULL"),
    addColumn("expenses", "external_ref", "VARCHAR(100) NULL"),
    addColumn("expenses", "date_is_estimate", "TINYINT(1) NOT NULL DEFAULT 0"),
    addColumn("expenses", "import_key", "VARCHAR(100) NULL"),
    addColumn("expenses", "import_hash", "CHAR(64) NULL"),
    addUnique("expenses", "uq_expenses_import_key", "`import_key`"),
    addKey("expenses", "idx_expenses_project", "`project_tag`"),
  );

  // --- assets ---
  steps.push(
    addColumn("assets", "seller", "VARCHAR(200) NULL"),
    addColumn("assets", "paid_from", `ENUM(${list(ACCOUNTS)}) NOT NULL DEFAULT 'bank'`),
    addColumn("assets", "instalment_amount", "DECIMAL(10,2) NULL"),
    addColumn("assets", "instalment_count", "INT NULL"),
    addColumn("assets", "import_key", "VARCHAR(100) NULL"),
    addColumn("assets", "import_hash", "CHAR(64) NULL"),
    addUnique("assets", "uq_assets_import_key", "`import_key`"),
  );

  // --- new tables ---
  steps.push(
    createTable(
      "asset_payments",
      `CREATE TABLE \`asset_payments\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`asset_id\` VARCHAR(36) NOT NULL,
        \`payment_date\` VARCHAR(10) NOT NULL,
        \`amount\` DECIMAL(10,2) NOT NULL,
        \`paid_from\` ENUM(${list(ACCOUNTS)}) NOT NULL DEFAULT 'bank',
        \`instalment_no\` INT NULL,
        \`bank_match\` ENUM(${list(BANK_MATCH)}) NOT NULL DEFAULT 'unchecked',
        \`note\` VARCHAR(500) NULL,
        \`import_key\` VARCHAR(100) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_asset_payments_import_key\` (\`import_key\`),
        KEY \`idx_asset_payments_asset\` (\`asset_id\`),
        KEY \`idx_asset_payments_date\` (\`payment_date\`),
        CONSTRAINT \`fk_asset_payments_asset\` FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ),
    // product_id must match products.id's charset or the FK is rejected (errno 150);
    // products.id is latin1 here, so read it from the live schema instead of guessing.
    createTable(
      "product_option_costs",
      productOptionCostsSql("CHARACTER SET <products.id charset>"),
      async (conn, db) => productOptionCostsSql(await columnCharset(conn, db, "products", "id")),
    ),
    createTable(
      "income_entries",
      `CREATE TABLE \`income_entries\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`entry_date\` VARCHAR(10) NOT NULL,
        \`date_is_estimate\` TINYINT(1) NOT NULL DEFAULT 0,
        \`kind\` ENUM('project','event','other','capital_in','capital_out') NOT NULL,
        \`source_name\` VARCHAR(200) NOT NULL,
        \`amount\` DECIMAL(10,2) NOT NULL,
        \`account\` ENUM(${list(ACCOUNTS)}) NOT NULL DEFAULT 'bank',
        \`project_tag\` VARCHAR(64) NULL,
        \`bank_match\` ENUM(${list(BANK_MATCH)}) NOT NULL DEFAULT 'unchecked',
        \`note\` VARCHAR(500) NULL,
        \`import_key\` VARCHAR(100) NULL,
        \`import_hash\` CHAR(64) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_income_import_key\` (\`import_key\`),
        KEY \`idx_income_date\` (\`entry_date\`),
        KEY \`idx_income_kind\` (\`kind\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ),
  );

  // --- payouts (transfers) ---
  steps.push(
    addColumn(
      "payouts",
      "from_account",
      `ENUM(${list(ACCOUNTS)}) NOT NULL DEFAULT 'paypal' AFTER \`payout_date\``,
    ),
    enumModify("payouts", "paid_into", PAID_INTO, "NOT NULL DEFAULT 'bank'"),
  );

  // --- orders / order_items / products ---
  steps.push(
    enumModify("orders", "payment_method", PAYMENT_METHODS, "NULL"),
    addColumn(
      "order_items",
      "unit_cost_source",
      "ENUM('snapshot','estimate','manual') NULL AFTER `unit_cost`",
    ),
    addColumn("products", "cost_price", "DECIMAL(10,2) NULL"),
    addColumn("products", "cost_per_extra_unit", "DECIMAL(10,2) NULL"),
    addColumn("products", "cost_updated_at", "TIMESTAMP NULL DEFAULT NULL"),
  );

  return steps;
}

// Data fixes. Run AFTER all schema steps. Self-limiting WHERE clauses.
const DATA_FIXES = [
  {
    desc: "order_items.unit_cost_source='manual' where unit_cost already set",
    countSql:
      "SELECT COUNT(*) AS n FROM `order_items` WHERE unit_cost IS NOT NULL AND unit_cost_source IS NULL",
    sql: "UPDATE `order_items` SET unit_cost_source = 'manual' WHERE unit_cost IS NOT NULL AND unit_cost_source IS NULL",
    requires: [["order_items", "unit_cost_source"]],
  },
  {
    desc: "orders.payment_method='paypal' where NULL but a PayPal capture exists and amount_paid>0",
    countSql:
      "SELECT COUNT(*) AS n FROM `orders` WHERE payment_method IS NULL AND paypal_capture_id IS NOT NULL AND amount_paid > 0",
    // updated_at = updated_at pins the ON UPDATE CURRENT_TIMESTAMP so this
    // bookkeeping fix does not make old orders look recently modified.
    sql: "UPDATE `orders` SET payment_method = 'paypal', updated_at = updated_at WHERE payment_method IS NULL AND paypal_capture_id IS NOT NULL AND amount_paid > 0",
    requires: [],
  },
];

const VERIFY_TABLES = [
  "expenses",
  "assets",
  "asset_payments",
  "income_entries",
  "product_option_costs",
  "payouts",
  "products",
  "order_items",
  "orders",
];

async function run() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const conn = await mysql.createConnection(url);

  try {
    const [dbRows] = await conn.query("SELECT DATABASE() AS db");
    const liveDbName = dbRows[0] && dbRows[0].db;
    if (!liveDbName) throw new Error("connection has no database selected");

    console.log(`${TAG} connected to ${liveDbName}`);

    if (process.env.DB_NAME && process.env.DB_NAME !== liveDbName) {
      console.warn(
        `${TAG} WARNING: DB_NAME=${process.env.DB_NAME} but connected to ${liveDbName} - ignoring DB_NAME`,
      );
    }

    if (args.expectDb && args.expectDb !== liveDbName) {
      console.error(
        `${TAG} FATAL: --expect-db=${args.expectDb} but connected to ${liveDbName}. Aborting.`,
      );
      process.exitCode = 1;
      return;
    }

    const db = liveDbName;
    const steps = buildSteps();
    let applied = 0;
    let skipped = 0;

    // Pre-flight: the tables we ALTER must exist, otherwise the guards below
    // would throw confusing errors half way through.
    for (const t of ["expenses", "assets", "payouts", "orders", "order_items", "products"]) {
      if (!(await tableExists(conn, db, t))) {
        throw new Error(`prerequisite table ${t} is missing in ${db}`);
      }
    }

    if (args.dryRun) console.log(`${TAG} --dry-run: evaluating guards, executing nothing`);

    for (const step of steps) {
      // In a dry run later steps (e.g. KEY on a not-yet-added column) can have
      // their guard evaluated safely: guards only read INFORMATION_SCHEMA.
      const needed = await step.needed(conn, db);
      if (!needed) {
        skipped++;
        console.log(`${TAG} skip   ${step.desc} (already applied)`);
        continue;
      }
      if (args.dryRun) {
        applied++;
        console.log(`${TAG} WOULD  ${step.desc}\n        ${step.sql.replace(/\s+/g, " ")}`);
        continue;
      }
      await conn.query(step.buildSql ? await step.buildSql(conn, db) : step.sql);
      applied++;
      console.log(`${TAG} done   ${step.desc}`);
    }

    // Data fixes.
    for (const fix of DATA_FIXES) {
      let columnsReady = true;
      for (const [t, c] of fix.requires) {
        if ((await columnType(conn, db, t, c)) === null) columnsReady = false;
      }
      if (args.dryRun) {
        if (!columnsReady) {
          console.log(`${TAG} WOULD  data fix: ${fix.desc} (row count n/a until columns exist)`);
        } else {
          const [rows] = await conn.query(fix.countSql);
          console.log(`${TAG} WOULD  data fix: ${fix.desc} -> ${rows[0].n} row(s)`);
        }
        continue;
      }
      const [res] = await conn.query(fix.sql);
      console.log(`${TAG} data fix: ${fix.desc} -> affected ${res.affectedRows} row(s)`);
    }

    console.log(
      `${TAG} schema steps: ${applied} ${args.dryRun ? "would apply" : "applied"}, ${skipped} already in place`,
    );

    if (args.dryRun) {
      console.log(`${TAG} --dry-run: no changes made.`);
      return;
    }

    for (const t of VERIFY_TABLES) {
      console.log(`\n${TAG} --- SHOW CREATE TABLE ${t} ---`);
      const [rows] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
      console.log(rows[0]["Create Table"]);
    }

    // Post-conditions: fail loudly if the DDL did not land.
    const checks = [
      ["expenses", "bank_match"],
      ["expenses", "import_key"],
      ["assets", "instalment_count"],
      ["payouts", "from_account"],
      ["order_items", "unit_cost_source"],
      ["products", "cost_price"],
      ["products", "cost_per_extra_unit"],
      ["products", "cost_updated_at"],
    ];
    for (const [t, c] of checks) {
      if ((await columnType(conn, db, t, c)) === null) {
        throw new Error(`post-check failed: ${t}.${c} is missing`);
      }
    }
    for (const t of ["asset_payments", "income_entries", "product_option_costs"]) {
      if (!(await tableExists(conn, db, t))) throw new Error(`post-check failed: ${t} missing`);
    }
    const pm = await columnType(conn, db, "orders", "payment_method");
    if (pm.toLowerCase() !== enumType(PAYMENT_METHODS)) {
      throw new Error(`post-check failed: orders.payment_method is ${pm}`);
    }
    console.log(`\n${TAG} OK: accounting v2 schema applied to ${db}`);
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(`${TAG} FATAL:`, err.message || err);
  process.exitCode = 1;
});
