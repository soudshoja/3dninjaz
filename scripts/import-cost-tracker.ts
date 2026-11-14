/* eslint-disable no-console */
/**
 * Accounting v2 - import of the owner's cost-tracker workbook.
 *
 * Reads the LOCAL, git-ignored fixture .planning/data/cost-tracker-2026-11.json
 * (made by .planning/data/extract-cost-tracker.py; it holds private financial
 * records and the repo is public, so it is never committed - copy it to the box
 * and pass --fixture=<path>) and writes expenses, assets,
 * asset_payments and income_entries. Self-contained on purpose: only
 * mysql2/promise and node:* are imported, so it runs the same under
 * `tsx` locally and as an esbuild-bundled .cjs on the box.
 *
 * Usage:
 *   tsx scripts/import-cost-tracker.ts                       # dry run (default)
 *   tsx scripts/import-cost-tracker.ts --commit --expect-db=ninjaz_3dn
 *   tsx scripts/import-cost-tracker.ts --commit --expect-db=ninjaz_3dn --update-drift
 *   --fixture=<path>   override the fixture location
 *   --allow-prod       required in addition to --commit when the DB is ninjaz_3dnp
 *
 * Safety properties:
 *   - SELECT DATABASE() on the live connection is the authority for "which DB".
 *     --expect-db=<name> aborts on mismatch and is REQUIRED with --commit.
 *   - Dry run executes every INSERT inside the transaction (so enums, lengths and
 *     unique keys are exercised) and then ROLLS BACK.
 *   - One transaction per run. Expected totals are asserted against the rows
 *     WHERE import_key LIKE 'ct26:%' (database state, in integer cents) before
 *     COMMIT; any difference >= 0.01 rolls everything back.
 *   - Idempotent: same import_key + same import_hash = skip. Same key with a
 *     different hash = drift (reported; only overwritten with --update-drift,
 *     which UPDATEs in place and never deletes, so asset_payments survive).
 *     asset_payments has no hash column: skip-if-key-exists, drift rides on the
 *     parent asset hash.
 *   - Website income is derived from orders and is never stored in
 *     income_entries: the sheet's Website row is skipped with a warning and a
 *     hard guard throws if any Website row reaches the insert list.
 *
 * Rollback: DELETE FROM asset_payments WHERE import_key LIKE 'ct26:%';
 *           DELETE FROM assets         WHERE import_key LIKE 'ct26:%';
 *           DELETE FROM expenses       WHERE import_key LIKE 'ct26:%';
 *           DELETE FROM income_entries WHERE import_key LIKE 'ct26:%';
 */

import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Cell = string | number | null | undefined;
interface FixtureRow {
  tab: string;
  keyTab: string;
  num: number | string;
  sheetRow: number;
  cells: Record<string, Cell>;
  hash: string;
}
interface Fixture {
  fixture: string;
  source: string;
  summary: Record<string, number>;
  rows: FixtureRow[];
}

type Account = "paypal" | "bank" | "cash" | "credit_card";
type BankMatch = "unchecked" | "matched" | "check" | "not_found";

interface PlannedExpense {
  importKey: string;
  hash: string;
  tab: string;
  rec: {
    expense_date: string;
    category: string;
    subcategory: string | null;
    note: string;
    amount: string;
    paid_from: Account;
    via_paypal: number;
    supplier_name: string | null;
    currency: string;
    amount_original: string | null;
    fx_rate: string | null;
    project_tag: string | null;
    bank_match: BankMatch;
    bank_amount: string | null;
    external_ref: string | null;
    date_is_estimate: number;
  };
}
interface PlannedAsset {
  importKey: string;
  hash: string;
  rec: {
    asset_date: string;
    name: string;
    amount: string;
    note: string | null;
    seller: string | null;
    paid_from: Account;
    instalment_amount: string | null;
    instalment_count: number | null;
  };
}
interface PlannedPayment {
  importKey: string;
  assetKey: string;
  rec: {
    payment_date: string;
    amount: string;
    paid_from: Account;
    instalment_no: number | null;
    bank_match: BankMatch;
    note: string | null;
  };
}
interface PlannedIncome {
  importKey: string;
  hash: string;
  rec: {
    entry_date: string;
    date_is_estimate: number;
    kind: string;
    source_name: string;
    amount: string;
    account: Account;
    project_tag: string | null;
    bank_match: BankMatch;
    note: string | null;
  };
}
interface Plan {
  expenses: PlannedExpense[];
  assets: PlannedAsset[];
  payments: PlannedPayment[];
  incomes: PlannedIncome[];
  warnings: string[];
  imputed: string[];
}

// ---------------------------------------------------------------------------
// Expected totals (cents) for fixture cost-tracker-2026-11. See the plan.
// ---------------------------------------------------------------------------
const EXPECTED = {
  expenseRows: 194,
  expenseCents: 2257165,
  byTab: {
    "ct26:Supplies": { n: 165, cents: 1498655 },
    "ct26:Designer": { n: 13, cents: 294300 },
    "ct26:Marketing": { n: 13, cents: 210000 },
    "ct26:JoMelon": { n: 3, cents: 254210 },
  } as Record<string, { n: number; cents: number }>,
  suppliesByMatch: { matched: 682944, check: 40518, not_found: 775193 } as Record<string, number>,
  assetRows: 4,
  assetCents: 1093296,
  paymentRows: 5,
  paymentCents: 745058,
  instalmentOwedCents: 348238,
  incomeByKind: { project: 1340000, event: 186400, capital_in: 200000 } as Record<string, number>,
  incomeRows: 4,
};

const SNAPMAKER_PAY_DATES = ["2026-07-30", "2026-08-19"]; // plan: only dates for the 2 paid instalments
const JO_MELON_ROW2_DATE = "2026-08-21";
const UNDATED_INCOME_DATE = "2026-09-30";
const NOTE_SEP = " — ";

const CATEGORY_MAP: Record<string, string> = {
  Filament: "materials",
  "Keychains & Rings": "materials",
  Lanyard: "materials",
  "Products & Parts": "materials",
  Packaging: "packaging",
  "Filament Storage": "consumables",
  "Maintenance & Consumables": "consumables",
  "Equipment & Setup": "equipment",
  Other: "other",
};
const MATCH_MAP: Record<string, BankMatch> = {
  Matched: "matched",
  Check: "check",
  "Not found": "not_found",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fail(msg: string): never {
  throw new Error(msg);
}

function str(c: Cell): string | null {
  if (c === null || c === undefined) return null;
  const s = String(c).trim();
  return s === "" ? null : s;
}

function reqStr(row: FixtureRow, col: string): string {
  return str(row.cells[col]) ?? fail(`${row.tab} #${row.num}: missing "${col}"`);
}

function num(row: FixtureRow, col: string): number {
  const v = row.cells[col];
  if (typeof v !== "number") fail(`${row.tab} #${row.num}: "${col}" is not a number (${String(v)})`);
  return v;
}

/** Sheet number -> integer cents. Must be exact to 2dp unless `allowRound`. */
function cents(x: number, label: string, allowRound = false): number {
  const c = Math.round(x * 100);
  if (!allowRound && Math.abs(x * 100 - c) > 1e-6) fail(`${label}: ${x} is not exact to 2 decimals`);
  return c;
}

function money(c: number): string {
  return (c / 100).toFixed(2);
}

function fmt(c: number): string {
  return (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateOf(row: FixtureRow, col: string): string | null {
  const s = str(row.cells[col]);
  if (s === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`${row.tab} #${row.num}: bad date "${s}"`);
  return s;
}

function limited(label: string, v: string | null, max: number): string | null {
  if (v !== null && v.length > max) fail(`${label}: length ${v.length} exceeds ${max}`);
  return v;
}

function joinNote(item: string, notes: string | null): string {
  return notes ? item + NOTE_SEP + notes : item;
}

function matchOf(row: FixtureRow, col: string): BankMatch {
  const v = reqStr(row, col);
  return MATCH_MAP[v] ?? fail(`${row.tab} #${row.num}: unknown bank match "${v}"`);
}

function rowsOf(fx: Fixture, tab: string): FixtureRow[] {
  return fx.rows.filter((r) => r.tab === tab);
}

function key(row: FixtureRow, suffix = ""): string {
  return `ct26:${row.keyTab}:${row.num}${suffix}`;
}

// ---------------------------------------------------------------------------
// Plan builder (pure: fixture -> records)
// ---------------------------------------------------------------------------
function buildPlan(fx: Fixture): Plan {
  const plan: Plan = { expenses: [], assets: [], payments: [], incomes: [], warnings: [], imputed: [] };

  // ---- Supplies: impute dates over ALL rows first (the Cart needs one too) ----
  const supplies = rowsOf(fx, "Supplies").sort((a, b) => Number(a.num) - Number(b.num));
  const dateBySource = new Map<string, Array<{ n: number; date: string }>>();
  for (const r of supplies) {
    const d = dateOf(r, "Date");
    if (d) {
      const src = reqStr(r, "Source");
      const list = dateBySource.get(src) ?? [];
      list.push({ n: Number(r.num), date: d });
      dateBySource.set(src, list);
    }
  }
  const imputedDate = (r: FixtureRow): string => {
    const src = reqStr(r, "Source");
    const dated = dateBySource.get(src) ?? fail(`Supplies #${r.num}: Source "${src}" has no dated row to impute from`);
    const n = Number(r.num);
    const before = dated.filter((d) => d.n < n);
    if (before.length > 0) return before[before.length - 1].date; // nearest preceding by sheet #
    return dated.map((d) => d.date).sort()[0]; // else earliest dated row of that Source
  };

  const cartRows = supplies.filter(
    (r) => reqStr(r, "Item").toLowerCase() === "cart" && reqStr(r, "Category") === "Equipment & Setup",
  );
  if (cartRows.length !== 1) fail(`expected exactly one Cart row in Supplies, found ${cartRows.length}`);
  const cart = cartRows[0];

  for (const r of supplies) {
    const given = dateOf(r, "Date");
    const date = given ?? imputedDate(r);
    const estimate = given ? 0 : 1;
    if (estimate) plan.imputed.push(`Supplies #${r.num} (${reqStr(r, "Source")}) -> ${date}`);
    const amountC = cents(num(r, "Amount (RM)"), `Supplies #${r.num} amount`);
    const bankMatch = matchOf(r, "Bank match");
    const notes = str(r.cells["Notes"]);

    if (r === cart) {
      plan.assets.push({
        importKey: key(r),
        hash: r.hash,
        rec: {
          asset_date: date,
          name: "Cart",
          amount: money(amountC),
          note: limited("Cart note", notes, 500),
          seller: null,
          paid_from: "bank",
          instalment_amount: null,
          instalment_count: null,
        },
      });
      plan.payments.push({
        importKey: key(r, ":pay1"),
        assetKey: key(r),
        rec: {
          payment_date: date,
          amount: money(amountC),
          paid_from: "bank",
          instalment_no: null,
          bank_match: bankMatch,
          note: "Date estimated: the sheet has no date for this row",
        },
      });
      continue;
    }

    const category = reqStr(r, "Category");
    const bankAmt = r.cells["Bank amount (RM)"];
    plan.expenses.push({
      importKey: key(r),
      hash: r.hash,
      tab: r.keyTab,
      rec: {
        expense_date: date,
        category: CATEGORY_MAP[category] ?? fail(`Supplies #${r.num}: unmapped category "${category}"`),
        subcategory: limited(`Supplies #${r.num} subcategory`, category, 64),
        note: limited(`Supplies #${r.num} note`, joinNote(reqStr(r, "Item"), notes), 500) as string,
        amount: money(amountC),
        paid_from: "bank",
        via_paypal: 0,
        supplier_name: limited(`Supplies #${r.num} supplier`, reqStr(r, "Source"), 200),
        currency: "MYR",
        amount_original: null,
        fx_rate: null,
        project_tag: null,
        bank_match: bankMatch,
        bank_amount: typeof bankAmt === "number" ? money(cents(bankAmt, `Supplies #${r.num} bank amount`)) : null,
        external_ref: null,
        date_is_estimate: estimate,
      },
    });
  }

  // ---- Designer ----
  for (const r of rowsOf(fx, "Designer")) {
    plan.expenses.push({
      importKey: key(r),
      hash: r.hash,
      tab: r.keyTab,
      rec: {
        expense_date: dateOf(r, "Date") ?? fail(`Designer #${r.num}: no date`),
        category: "design",
        subcategory: null,
        note: limited(`Designer #${r.num} note`, reqStr(r, "Description"), 500) as string,
        amount: money(cents(num(r, "Amount (RM)"), `Designer #${r.num} amount`)),
        paid_from: "credit_card",
        via_paypal: 1,
        supplier_name: "PayPal *JAMESBRYAN321",
        currency: "MYR",
        amount_original: null,
        fx_rate: null,
        project_tag: null,
        bank_match: "matched",
        bank_amount: null,
        external_ref: limited(`Designer #${r.num} ref`, str(r.cells["Card statement"]), 100),
        date_is_estimate: 0,
      },
    });
  }

  // ---- Marketing (row 6 is a -100 refund and is kept negative) ----
  for (const r of rowsOf(fx, "Marketing")) {
    plan.expenses.push({
      importKey: key(r),
      hash: r.hash,
      tab: r.keyTab,
      rec: {
        expense_date: dateOf(r, "Date") ?? fail(`Marketing #${r.num}: no date`),
        category: "marketing",
        subcategory: null,
        note: limited(`Marketing #${r.num} note`, reqStr(r, "Description"), 500) as string,
        amount: money(cents(num(r, "Amount (RM)"), `Marketing #${r.num} amount`)),
        paid_from: "bank",
        via_paypal: 0,
        supplier_name: "Wise Payments Malaysia",
        currency: "MYR",
        amount_original: null,
        fx_rate: null,
        project_tag: null,
        // The sheet carries no bank-check column for Marketing and the plan is
        // silent: left unchecked rather than inventing a result.
        bank_match: "unchecked",
        bank_amount: null,
        external_ref: limited(`Marketing #${r.num} ref`, str(r.cells["Reference / transaction"]), 100),
        date_is_estimate: 0,
      },
    });
  }

  // ---- Jo Melon project costs ----
  for (const r of rowsOf(fx, "Jo Melon")) {
    const n = Number(r.num);
    const currency = reqStr(r, "Currency");
    const given = dateOf(r, "Date");
    if (!given && n !== 2) fail(`Jo Melon #${n}: undated and no imputation rule`);
    const date = given ?? JO_MELON_ROW2_DATE;
    if (!given) plan.imputed.push(`Jo Melon #${n} -> ${date}`);
    const isTax = n === 3;
    const foreign = currency !== "MYR";
    const rate = r.cells["Rate to MYR"];
    // Only the USD-converted RM figure is allowed to need rounding (340.8407...).
    const amountC = cents(num(r, "Amount (RM)"), `Jo Melon #${n} amount`, foreign);
    plan.expenses.push({
      importKey: key(r),
      hash: r.hash,
      tab: r.keyTab,
      rec: {
        expense_date: date,
        category: isTax ? "fees" : "materials",
        subcategory: isTax ? "Import tax/duty" : null,
        note: limited(`Jo Melon #${n} note`, joinNote(reqStr(r, "Description"), str(r.cells["Note"])), 500) as string,
        amount: money(amountC),
        paid_from: isTax ? "credit_card" : "bank",
        via_paypal: isTax ? 1 : 0,
        supplier_name: reqStr(r, "Paid to"),
        currency,
        amount_original: foreign ? money(cents(num(r, "Amount (original)"), `Jo Melon #${n} original`)) : null,
        fx_rate: foreign && typeof rate === "number" ? rate.toFixed(8) : null,
        project_tag: "jo-melon",
        bank_match: matchOf(r, "Bank check"),
        bank_amount: null,
        external_ref: null,
        date_is_estimate: given ? 0 : 1,
      },
    });
  }

  // ---- Machines -> assets + asset_payments ----
  const machines = rowsOf(fx, "Machines");
  const expectMachines = ["P2S", "Snapmaker", "A1"];
  if (machines.map((m) => String(m.num)).join(",") !== expectMachines.join(",")) {
    fail(`Machines: expected ${expectMachines.join(",")}, got ${machines.map((m) => m.num).join(",")}`);
  }
  for (const m of machines) {
    const name = String(m.num);
    const unitC = cents(num(m, "Instalment / price (RM)"), `${name} instalment`);
    const count = num(m, "No. of instalments");
    const paidCount = num(m, "Instalments paid");
    const totalC = cents(num(m, "Total cost (RM)"), `${name} total`);
    if (unitC * count !== totalC) fail(`${name}: ${unitC} x ${count} != total ${totalC}`);
    const firstDate = dateOf(m, "First payment date") ?? fail(`${name}: no first payment date`);
    const isInstalment = count > 1;
    const account: Account = name === "Snapmaker" ? "credit_card" : "bank";
    plan.assets.push({
      importKey: key(m),
      hash: m.hash,
      rec: {
        asset_date: firstDate,
        name,
        amount: money(totalC),
        note: limited(`${name} note`, str(m.cells["Notes"]), 500),
        seller: limited(`${name} seller`, str(m.cells["Seller"]), 200),
        paid_from: account,
        instalment_amount: isInstalment ? money(unitC) : null,
        instalment_count: isInstalment ? count : null,
      },
    });
    if (isInstalment) {
      if (paidCount !== SNAPMAKER_PAY_DATES.length) {
        fail(`${name}: sheet says ${paidCount} instalments paid, importer only knows dates for ${SNAPMAKER_PAY_DATES.length}`);
      }
      SNAPMAKER_PAY_DATES.forEach((d, i) => {
        plan.payments.push({
          importKey: key(m, `:pay${i + 1}`),
          assetKey: key(m),
          rec: {
            payment_date: d,
            amount: money(unitC),
            paid_from: account,
            instalment_no: i + 1,
            bank_match: "matched",
            note: `Instalment ${i + 1} of ${count}`,
          },
        });
      });
    } else {
      if (paidCount !== 1) fail(`${name}: one-off machine with ${paidCount} payments`);
      plan.payments.push({
        importKey: key(m, ":pay1"),
        assetKey: key(m),
        rec: {
          payment_date: firstDate,
          amount: money(totalC),
          paid_from: account,
          instalment_no: null,
          bank_match: "matched",
          note: "Paid in full",
        },
      });
    }
  }

  // ---- Income & Funding -> income_entries (Website is derived from orders) ----
  for (const r of rowsOf(fx, "Income & Funding")) {
    const from = reqStr(r, "From");
    const type = reqStr(r, "Type");
    const amountC = cents(num(r, "Amount (RM)"), `Income #${r.num} amount`);
    if (from.toLowerCase() === "website") {
      plan.warnings.push(
        `Income #${r.num}: "Website" RM ${fmt(amountC)} NOT imported (website sales are derived from orders). ` +
          `Compare it to the orders-derived sales figure for the same period.`,
      );
      continue;
    }
    const given = dateOf(r, "Date");
    const sheetNote = str(r.cells["Note"]);
    let kind: string;
    let projectTag: string | null = null;
    let bankMatch: BankMatch;
    let note = sheetNote;
    if (type === "Funding") {
      kind = "capital_in";
      bankMatch = "not_found"; // sheet: no matching transfer found in the statements
    } else if (type === "Income" && from === "Jo Melon project") {
      kind = "project";
      projectTag = "jo-melon";
      bankMatch = "matched"; // 1400: owner confirmed received in bank; 12000: statement credit found
      if (Number(r.num) === 2) note = (sheetNote ? `${sheetNote}. ` : "") + "Owner confirmed this was received in the bank.";
    } else if (type === "Income" && from === "Bazaar") {
      kind = "event";
      bankMatch = "not_found";
      note = joinNote("Bank + cash combined", sheetNote);
    } else {
      fail(`Income #${r.num}: unmapped row "${from}" / "${type}"`);
    }
    plan.incomes.push({
      importKey: key(r),
      hash: r.hash,
      rec: {
        entry_date: given ?? UNDATED_INCOME_DATE,
        date_is_estimate: given ? 0 : 1,
        kind,
        source_name: from,
        amount: money(amountC),
        account: "bank",
        project_tag: projectTag,
        bank_match: bankMatch,
        note: limited(`Income #${r.num} note`, note, 500),
      },
    });
    if (!given) plan.imputed.push(`Income #${r.num} (${from}) -> ${UNDATED_INCOME_DATE}`);
  }

  // Hard guard: Website must never reach the insert list.
  for (const i of plan.incomes) {
    if (i.rec.source_name.trim().toLowerCase().includes("website")) fail(`refusing to import income row "${i.rec.source_name}"`);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// CLI / env
// ---------------------------------------------------------------------------
interface Args {
  commit: boolean;
  updateDrift: boolean;
  allowProd: boolean;
  expectDb: string | null;
  fixture: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { commit: false, updateDrift: false, allowProd: false, expectDb: null, fixture: null };
  for (const arg of argv) {
    if (arg === "--commit") a.commit = true;
    else if (arg === "--dry-run") a.commit = false;
    else if (arg === "--update-drift") a.updateDrift = true;
    else if (arg === "--allow-prod") a.allowProd = true;
    else if (arg.startsWith("--expect-db=")) a.expectDb = arg.slice("--expect-db=".length);
    else if (arg.startsWith("--fixture=")) a.fixture = arg.slice("--fixture=".length);
    else fail(`unknown argument ${arg}`);
  }
  return a;
}

function loadEnv(root: string): void {
  const envPath = path.resolve(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

// ---------------------------------------------------------------------------
// DB work
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Conn = mysql.Connection;

interface Counts {
  insert: number;
  skip: number;
  drift: number;
  updated: number;
}
const newCounts = (): Counts => ({ insert: 0, skip: 0, drift: 0, updated: 0 });

async function existing(conn: Conn, table: string, hasHash: boolean): Promise<Map<string, { id: string; hash: string | null }>> {
  const [rows] = await conn.query(
    `SELECT id, import_key${hasHash ? ", import_hash" : ""} FROM ${table} WHERE import_key LIKE 'ct26:%'`,
  );
  const m = new Map<string, { id: string; hash: string | null }>();
  for (const r of rows as Row[]) m.set(String(r.import_key), { id: String(r.id), hash: hasHash ? ((r.import_hash as string | null) ?? null) : null });
  return m;
}

async function upsertAll(
  conn: Conn,
  table: string,
  items: Array<{ importKey: string; hash: string; rec: object }>,
  updateDrift: boolean,
  drifts: string[],
): Promise<{ counts: Counts; ids: Map<string, string> }> {
  const have = await existing(conn, table, true);
  const counts = newCounts();
  const ids = new Map<string, string>();
  for (const it of items) {
    const cur = have.get(it.importKey);
    if (!cur) {
      const id = randomUUID();
      const cols = ["id", "import_key", "import_hash", ...Object.keys(it.rec)];
      const vals = [id, it.importKey, it.hash, ...Object.values(it.rec)];
      await conn.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, vals);
      ids.set(it.importKey, id);
      counts.insert++;
    } else if (cur.hash === it.hash) {
      ids.set(it.importKey, cur.id);
      counts.skip++;
    } else {
      ids.set(it.importKey, cur.id);
      counts.drift++;
      drifts.push(`${table} ${it.importKey}: sheet content changed since import (stored hash ${String(cur.hash).slice(0, 10)}..., new ${it.hash.slice(0, 10)}...)`);
      if (updateDrift) {
        const sets = Object.keys(it.rec).map((c) => `${c} = ?`).concat("import_hash = ?");
        await conn.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`, [...Object.values(it.rec), it.hash, cur.id]);
        counts.updated++;
      }
    }
  }
  return { counts, ids };
}

async function insertPayments(conn: Conn, payments: PlannedPayment[], assetIds: Map<string, string>): Promise<Counts> {
  const have = await existing(conn, "asset_payments", false);
  const counts = newCounts();
  for (const p of payments) {
    if (have.has(p.importKey)) {
      counts.skip++;
      continue;
    }
    const assetId = assetIds.get(p.assetKey) ?? fail(`no asset id for ${p.assetKey}`);
    const cols = ["id", "asset_id", "import_key", ...Object.keys(p.rec)];
    const vals = [randomUUID(), assetId, p.importKey, ...Object.values(p.rec)];
    await conn.query(`INSERT INTO asset_payments (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, vals);
    counts.insert++;
  }
  return counts;
}

/** Asserts DB state for rows keyed ct26:%. Returns the list of failures. */
async function assertTotals(conn: Conn, plan: Plan): Promise<{ problems: string[]; lines: string[] }> {
  const problems: string[] = [];
  const lines: string[] = [];
  const check = (label: string, got: number, want: number, isMoney = true) => {
    const ok = got === want;
    lines.push(`${ok ? "ok  " : "FAIL"} ${label}: ${isMoney ? fmt(got) : got}${ok ? "" : ` (expected ${isMoney ? fmt(want) : want})`}`);
    if (!ok) problems.push(`${label}: got ${isMoney ? fmt(got) : got}, expected ${isMoney ? fmt(want) : want}`);
  };
  const one = async (sql: string): Promise<Row> => ((await conn.query(sql))[0] as Row[])[0];

  const e = await one(`SELECT COUNT(*) n, IFNULL(ROUND(SUM(amount)*100),0) c FROM expenses WHERE import_key LIKE 'ct26:%'`);
  check("expenses rows", Number(e.n), EXPECTED.expenseRows, false);
  check("expenses total", Number(e.c), EXPECTED.expenseCents);
  const [byTab] = await conn.query(
    `SELECT SUBSTRING_INDEX(import_key, ':', 2) tab, COUNT(*) n, ROUND(SUM(amount)*100) c FROM expenses WHERE import_key LIKE 'ct26:%' GROUP BY tab`,
  );
  const tabMap = new Map((byTab as Row[]).map((r) => [String(r.tab), r]));
  for (const [tab, want] of Object.entries(EXPECTED.byTab)) {
    const got = tabMap.get(tab);
    check(`  ${tab} rows`, Number(got?.n ?? 0), want.n, false);
    check(`  ${tab} total`, Number(got?.c ?? 0), want.cents);
  }
  const [byMatch] = await conn.query(
    `SELECT bank_match m, ROUND(SUM(amount)*100) c FROM expenses WHERE import_key LIKE 'ct26:Supplies:%' GROUP BY bank_match`,
  );
  const matchMap = new Map((byMatch as Row[]).map((r) => [String(r.m), Number(r.c)]));
  for (const [m, want] of Object.entries(EXPECTED.suppliesByMatch)) check(`  Supplies bank_match ${m}`, matchMap.get(m) ?? 0, want);

  const a = await one(`SELECT COUNT(*) n, IFNULL(ROUND(SUM(amount)*100),0) c FROM assets WHERE import_key LIKE 'ct26:%'`);
  check("assets rows", Number(a.n), EXPECTED.assetRows, false);
  check("assets total (incl. Cart)", Number(a.c), EXPECTED.assetCents);
  const p = await one(`SELECT COUNT(*) n, IFNULL(ROUND(SUM(amount)*100),0) c FROM asset_payments WHERE import_key LIKE 'ct26:%'`);
  check("asset_payments rows", Number(p.n), EXPECTED.paymentRows, false);
  check("asset_payments total", Number(p.c), EXPECTED.paymentCents);
  const owedA = await one(`SELECT IFNULL(ROUND(SUM(amount)*100),0) c FROM assets WHERE import_key LIKE 'ct26:%' AND instalment_count > 1`);
  const owedP = await one(
    `SELECT IFNULL(ROUND(SUM(p.amount)*100),0) c FROM asset_payments p JOIN assets a ON a.id = p.asset_id WHERE a.import_key LIKE 'ct26:%' AND a.instalment_count > 1`,
  );
  check("still owed on instalments", Number(owedA.c) - Number(owedP.c), EXPECTED.instalmentOwedCents);

  const [byKind] = await conn.query(`SELECT kind, ROUND(SUM(amount)*100) c FROM income_entries WHERE import_key LIKE 'ct26:%' GROUP BY kind`);
  const kindMap = new Map((byKind as Row[]).map((r) => [String(r.kind), Number(r.c)]));
  for (const [k, want] of Object.entries(EXPECTED.incomeByKind)) check(`income ${k}`, kindMap.get(k) ?? 0, want);
  const i = await one(`SELECT COUNT(*) n FROM income_entries WHERE import_key LIKE 'ct26:%'`);
  check("income rows", Number(i.n), EXPECTED.incomeRows, false);
  const w = await one(`SELECT COUNT(*) n FROM income_entries WHERE import_key LIKE 'ct26:%' AND LOWER(source_name) LIKE '%website%'`);
  check("income rows named Website", Number(w.n), 0, false);

  // Charset round trip: every note that should contain an em dash still does.
  const dashPlanned = plan.expenses.filter((x) => x.rec.note.includes("—")).length;
  const dashDb = await one(`SELECT COUNT(*) n FROM expenses WHERE import_key LIKE 'ct26:%' AND note LIKE '%—%'`);
  check("notes with an em dash survived (charset)", Number(dashDb.n), dashPlanned, false);
  return { problems, lines };
}

async function checkSchema(conn: Conn, db: string): Promise<void> {
  const need: Array<[string, string]> = [
    ["expenses", "import_key"],
    ["expenses", "via_paypal"],
    ["assets", "instalment_count"],
    ["asset_payments", "import_key"],
    ["income_entries", "import_key"],
  ];
  for (const [t, c] of need) {
    const [r] = await conn.query(
      `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [db, t, c],
    );
    if (Number((r as Row[])[0].n) === 0) fail(`schema not migrated: ${t}.${c} missing in ${db}. Run scripts/accounting-v2-migrate.cjs first.`);
  }
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const root = path.resolve(typeof __dirname === "string" ? __dirname : process.cwd(), "..");
  const args = parseArgs(process.argv.slice(2));
  loadEnv(root);

  const fixturePath = args.fixture ?? path.resolve(root, ".planning", "data", "cost-tracker-2026-11.json");
  if (!fs.existsSync(fixturePath)) {
    throw new Error(
      `fixture not found: ${fixturePath}. The raw fixture is git-ignored (private data); ` +
        `generate it with .planning/data/extract-cost-tracker.py or pass --fixture=<path>.`,
    );
  }
  const fx = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Fixture;
  console.log(`fixture: ${fx.fixture} (${fx.rows.length} rows, from ${fx.source})`);

  // 1. Pure mapping + early sanity on the planned rows.
  const plan = buildPlan(fx);
  const plannedCents = plan.expenses.reduce((s, x) => s + Math.round(Number(x.rec.amount) * 100), 0);
  console.log(
    `planned: ${plan.expenses.length} expenses (${fmt(plannedCents)}), ${plan.assets.length} assets, ` +
      `${plan.payments.length} asset_payments, ${plan.incomes.length} income_entries`,
  );
  for (const w of plan.warnings) console.log(`WARNING: ${w}`);
  console.log(`imputed dates (date_is_estimate=1): ${plan.imputed.length}`);
  for (const s of plan.imputed) console.log(`  ${s}`);

  const rawUrl = process.env.DATABASE_URL ?? fail("DATABASE_URL is not set (and no .env.local next to scripts/)");
  const u = new URL(rawUrl);
  const conn = await mysql.createConnection({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
  });
  try {
    await conn.query("SET NAMES utf8mb4");
    const [dbRows] = await conn.query("SELECT DATABASE() AS db");
    const db = String((dbRows as Row[])[0].db ?? "");
    if (!db) fail("connection has no database selected");
    console.log(`connected to ${db}`);

    if (args.expectDb && args.expectDb !== db) fail(`--expect-db=${args.expectDb} but connected to ${db}; aborting`);
    if (args.commit && !args.expectDb) fail("--commit requires --expect-db=<name>");
    if (args.commit && db === "ninjaz_3dnp" && !args.allowProd) fail("refusing to --commit to ninjaz_3dnp without --allow-prod");
    console.log(args.commit ? "mode: COMMIT" : "mode: DRY RUN (everything is rolled back)");
    await checkSchema(conn, db);

    // 2. One transaction: write, assert database state, then commit or roll back.
    await conn.beginTransaction();
    let committed = false;
    try {
      const drifts: string[] = [];
      const exp = await upsertAll(conn, "expenses", plan.expenses, args.updateDrift, drifts);
      const ast = await upsertAll(conn, "assets", plan.assets, args.updateDrift, drifts);
      const pay = await insertPayments(conn, plan.payments, ast.ids);
      const inc = await upsertAll(conn, "income_entries", plan.incomes, args.updateDrift, drifts);

      const row = (label: string, c: Counts) =>
        console.log(`  ${label.padEnd(15)} insert ${String(c.insert).padStart(3)}  skip ${String(c.skip).padStart(3)}  drift ${String(c.drift).padStart(2)}  updated ${c.updated}`);
      console.log("result:");
      row("expenses", exp.counts);
      row("assets", ast.counts);
      row("asset_payments", pay);
      row("income_entries", inc.counts);
      if (drifts.length > 0) {
        console.log(`DRIFT (${drifts.length}):${args.updateDrift ? " overwritten (--update-drift)" : " NOT updated; rerun with --update-drift to overwrite"}`);
        for (const d of drifts) console.log(`  ${d}`);
      }

      const { problems, lines } = await assertTotals(conn, plan);
      console.log("assertions (database state, import_key LIKE 'ct26:%'):");
      for (const l of lines) console.log(`  ${l}`);
      if (problems.length > 0) fail(`assertions failed (${problems.length}); rolling back`);

      if (args.commit) {
        await conn.commit();
        committed = true;
        console.log("COMMITTED");
      }
    } finally {
      if (!committed) {
        await conn.rollback();
        console.log(args.commit ? "ROLLED BACK (failure)" : "dry run: rolled back, nothing written");
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
