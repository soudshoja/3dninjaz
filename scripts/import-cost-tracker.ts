/* eslint-disable no-console */
/**
 * Accounting v2 - import of a cost-tracker workbook.
 *
 * Generic on purpose: this file holds only the mapping LOGIC. Everything that is
 * specific to the owner's books (counterparty, supplier and project names, machine
 * names and instalment dates, row-specific rules and the expected totals) lives in
 * a PRIVATE, git-ignored config file, and the raw rows live in a private fixture.
 * The repo is public, so neither file is ever committed.
 *
 *   .planning/data/private/cost-tracker-config.json   (override: --config=<path>)
 *   .planning/data/private/cost-tracker-2026-11.json  (override: --fixture=<path>,
 *       or the "fixture" key of the config, resolved next to the config file)
 *   .planning/data/private/extract-cost-tracker.py    (workbook -> fixture)
 *
 * If the config file is missing the script exits with a message before it opens
 * a database connection or changes anything.
 *
 * Self-contained: only mysql2/promise and node:* are imported, so it runs the
 * same under `tsx` locally and as an esbuild-bundled .cjs on the box.
 *
 * Usage:
 *   tsx scripts/import-cost-tracker.ts                       # dry run (default)
 *   tsx scripts/import-cost-tracker.ts --commit --expect-db=<db>
 *   tsx scripts/import-cost-tracker.ts --commit --expect-db=<db> --update-drift
 *   --config=<path>    override the private config location
 *   --fixture=<path>   override the fixture location
 *   --allow-prod       required in addition to --commit when the DB is the prod DB
 *
 * Safety properties:
 *   - SELECT DATABASE() on the live connection is the authority for "which DB".
 *     --expect-db=<name> aborts on mismatch and is REQUIRED with --commit.
 *   - Dry run executes every INSERT inside the transaction (so enums, lengths and
 *     unique keys are exercised) and then ROLLS BACK.
 *   - One transaction per run. Expected totals (from the config, resolved against
 *     the fixture's own summary where it has the figure) are asserted against the
 *     rows WHERE import_key LIKE 'ct26:%' (database state, in integer cents)
 *     before COMMIT; any difference >= 0.01 rolls everything back.
 *   - Idempotent: same import_key + same import_hash = skip. Same key with a
 *     different hash = drift (reported; only overwritten with --update-drift,
 *     which UPDATEs in place and never deletes, so asset_payments survive).
 *     asset_payments has no hash column: skip-if-key-exists, drift rides on the
 *     parent asset hash.
 *   - Website income is derived from orders and is never stored in
 *     income_entries: a sheet row named Website is skipped with a warning and a
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
  /** The supplies row that became an asset (cents + bank match), if the config names one. */
  supplyAsset: { cents: number; match: BankMatch } | null;
  suppliesKeyTab: string | null;
}

// ---------------------------------------------------------------------------
// Private config (shape only; the values live in the git-ignored config file)
// ---------------------------------------------------------------------------
/** RM number, or a figure taken from the fixture's own summary (label -> value). */
type MoneySpec = number | { summary: string; minusAsset?: boolean; plusAsset?: boolean };

interface RowRule {
  category?: string;
  subcategory?: string | null;
  paidFrom?: Account;
  viaPaypal?: number;
}
interface Config {
  /** Fixture path, relative to the config file. --fixture wins. */
  fixture?: string;
  supplies: {
    tab: string;
    paidFrom: Account;
    /** The one row that is an asset, not an expense. */
    asset?: { item: string; category: string; assetName: string; paidFrom: Account; paymentNote: string };
  };
  /** Tabs whose rows all share one supplier, category and account. */
  fixedTabs: Array<{
    tab: string;
    category: string;
    paidFrom: Account;
    viaPaypal: number;
    supplierName: string;
    bankMatch: BankMatch;
    descriptionCol: string;
    refCol: string | null;
  }>;
  /** Project tabs: every row carries the project tag. */
  projectTabs: Array<{
    tab: string;
    projectTag: string;
    defaultRule: Required<Pick<RowRule, "category" | "paidFrom" | "viaPaypal">> & { subcategory?: string | null };
    /** keyed by sheet row number */
    rowRules?: Record<string, RowRule>;
    /** imputed date for undated rows, keyed by sheet row number */
    undatedDates?: Record<string, string>;
  }>;
  machines: {
    tab: string;
    /** expected machine names, in sheet order */
    names: string[];
    defaultPaidFrom: Account;
    paymentBankMatch: BankMatch;
    oneOffPaymentNote: string;
    byName?: Record<string, { paidFrom?: Account; instalmentDates?: string[] }>;
  };
  income: {
    tab: string;
    undatedDate: string;
    rules: Array<{
      type: string;
      from?: string;
      kind: string;
      account: Account;
      projectTag?: string | null;
      bankMatch: BankMatch;
      notePrefix?: string;
      /** keyed by sheet row number */
      noteAppend?: Record<string, string>;
    }>;
  };
  expected: {
    /** keyed by the fixture row keyTab (the middle part of import_key) */
    expenseTabs: Record<string, { rows: number; total: MoneySpec }>;
    /** applies to the supplies tab */
    suppliesByMatch: Partial<Record<BankMatch, MoneySpec>>;
    assets: { rows: number; total: MoneySpec };
    payments: { rows: number; total: MoneySpec };
    instalmentOwed: MoneySpec;
    income: { rows: number; byKind: Record<string, MoneySpec> };
  };
}

const ACCOUNTS: Account[] = ["paypal", "bank", "cash", "credit_card"];
const MATCHES: BankMatch[] = ["unchecked", "matched", "check", "not_found"];
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
function buildPlan(fx: Fixture, cfg: Config): Plan {
  const plan: Plan = { expenses: [], assets: [], payments: [], incomes: [], warnings: [], imputed: [], supplyAsset: null, suppliesKeyTab: null };

  // ---- Supplies: impute dates over ALL rows first (the asset row needs one too) ----
  const supplies = rowsOf(fx, cfg.supplies.tab).sort((a, b) => Number(a.num) - Number(b.num));
  if (supplies.length === 0) fail(`fixture has no rows for tab "${cfg.supplies.tab}"`);
  plan.suppliesKeyTab = supplies[0].keyTab;
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
    const dated = dateBySource.get(src) ?? fail(`${r.tab} #${r.num}: Source "${src}" has no dated row to impute from`);
    const n = Number(r.num);
    const before = dated.filter((d) => d.n < n);
    if (before.length > 0) return before[before.length - 1].date; // nearest preceding by sheet #
    return dated.map((d) => d.date).sort()[0]; // else earliest dated row of that Source
  };

  const assetCfg = cfg.supplies.asset;
  let assetRow: FixtureRow | null = null;
  if (assetCfg) {
    const found = supplies.filter(
      (r) => reqStr(r, "Item").toLowerCase() === assetCfg.item.toLowerCase() && reqStr(r, "Category") === assetCfg.category,
    );
    if (found.length !== 1) fail(`expected exactly one asset row in "${cfg.supplies.tab}", found ${found.length}`);
    assetRow = found[0];
  }

  for (const r of supplies) {
    const given = dateOf(r, "Date");
    const date = given ?? imputedDate(r);
    const estimate = given ? 0 : 1;
    if (estimate) plan.imputed.push(`${r.tab} #${r.num} (${reqStr(r, "Source")}) -> ${date}`);
    const amountC = cents(num(r, "Amount (RM)"), `${r.tab} #${r.num} amount`);
    const bankMatch = matchOf(r, "Bank match");
    const notes = str(r.cells["Notes"]);

    if (assetCfg && r === assetRow) {
      plan.supplyAsset = { cents: amountC, match: bankMatch };
      plan.assets.push({
        importKey: key(r),
        hash: r.hash,
        rec: {
          asset_date: date,
          name: assetCfg.assetName,
          amount: money(amountC),
          note: limited("asset note", notes, 500),
          seller: null,
          paid_from: assetCfg.paidFrom,
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
          paid_from: assetCfg.paidFrom,
          instalment_no: null,
          bank_match: bankMatch,
          note: assetCfg.paymentNote,
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
        category: CATEGORY_MAP[category] ?? fail(`${r.tab} #${r.num}: unmapped category "${category}"`),
        subcategory: limited(`${r.tab} #${r.num} subcategory`, category, 64),
        note: limited(`${r.tab} #${r.num} note`, joinNote(reqStr(r, "Item"), notes), 500) as string,
        amount: money(amountC),
        paid_from: cfg.supplies.paidFrom,
        via_paypal: 0,
        supplier_name: limited(`${r.tab} #${r.num} supplier`, reqStr(r, "Source"), 200),
        currency: "MYR",
        amount_original: null,
        fx_rate: null,
        project_tag: null,
        bank_match: bankMatch,
        bank_amount: typeof bankAmt === "number" ? money(cents(bankAmt, `${r.tab} #${r.num} bank amount`)) : null,
        external_ref: null,
        date_is_estimate: estimate,
      },
    });
  }

  // ---- Fixed-supplier tabs (refunds stay negative: the sign is the sheet's) ----
  for (const t of cfg.fixedTabs) {
    for (const r of rowsOf(fx, t.tab)) {
      plan.expenses.push({
        importKey: key(r),
        hash: r.hash,
        tab: r.keyTab,
        rec: {
          expense_date: dateOf(r, "Date") ?? fail(`${t.tab} #${r.num}: no date`),
          category: t.category,
          subcategory: null,
          note: limited(`${t.tab} #${r.num} note`, reqStr(r, t.descriptionCol), 500) as string,
          amount: money(cents(num(r, "Amount (RM)"), `${t.tab} #${r.num} amount`)),
          paid_from: t.paidFrom,
          via_paypal: t.viaPaypal,
          supplier_name: t.supplierName,
          currency: "MYR",
          amount_original: null,
          fx_rate: null,
          project_tag: null,
          bank_match: t.bankMatch,
          bank_amount: null,
          external_ref: t.refCol ? limited(`${t.tab} #${r.num} ref`, str(r.cells[t.refCol]), 100) : null,
          date_is_estimate: 0,
        },
      });
    }
  }

  // ---- Project tabs ----
  for (const t of cfg.projectTabs) {
    for (const r of rowsOf(fx, t.tab)) {
      const n = Number(r.num);
      const currency = reqStr(r, "Currency");
      const given = dateOf(r, "Date");
      const fallback = t.undatedDates?.[String(n)];
      if (!given && !fallback) fail(`${t.tab} #${n}: undated and no imputation rule in the config`);
      const date = given ?? (fallback as string);
      if (!given) plan.imputed.push(`${t.tab} #${n} -> ${date}`);
      const rule = { ...t.defaultRule, ...(t.rowRules?.[String(n)] ?? {}) };
      const foreign = currency !== "MYR";
      const rate = r.cells["Rate to MYR"];
      // Only a foreign-currency converted RM figure is allowed to need rounding.
      const amountC = cents(num(r, "Amount (RM)"), `${t.tab} #${n} amount`, foreign);
      plan.expenses.push({
        importKey: key(r),
        hash: r.hash,
        tab: r.keyTab,
        rec: {
          expense_date: date,
          category: rule.category,
          subcategory: rule.subcategory ?? null,
          note: limited(`${t.tab} #${n} note`, joinNote(reqStr(r, "Description"), str(r.cells["Note"])), 500) as string,
          amount: money(amountC),
          paid_from: rule.paidFrom,
          via_paypal: rule.viaPaypal,
          supplier_name: reqStr(r, "Paid to"),
          currency,
          amount_original: foreign ? money(cents(num(r, "Amount (original)"), `${t.tab} #${n} original`)) : null,
          fx_rate: foreign && typeof rate === "number" ? rate.toFixed(8) : null,
          project_tag: t.projectTag,
          bank_match: matchOf(r, "Bank check"),
          bank_amount: null,
          external_ref: null,
          date_is_estimate: given ? 0 : 1,
        },
      });
    }
  }

  // ---- Machines -> assets + asset_payments ----
  const mc = cfg.machines;
  const machines = rowsOf(fx, mc.tab);
  if (machines.map((m) => String(m.num)).join(",") !== mc.names.join(",")) {
    fail(`${mc.tab}: expected ${mc.names.join(",")}, got ${machines.map((m) => m.num).join(",")}`);
  }
  for (const m of machines) {
    const name = String(m.num);
    const over = mc.byName?.[name] ?? {};
    const unitC = cents(num(m, "Instalment / price (RM)"), `${name} instalment`);
    const count = num(m, "No. of instalments");
    const paidCount = num(m, "Instalments paid");
    const totalC = cents(num(m, "Total cost (RM)"), `${name} total`);
    if (unitC * count !== totalC) fail(`${name}: ${unitC} x ${count} != total ${totalC}`);
    const firstDate = dateOf(m, "First payment date") ?? fail(`${name}: no first payment date`);
    const isInstalment = count > 1;
    const account: Account = over.paidFrom ?? mc.defaultPaidFrom;
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
      const dates = over.instalmentDates ?? [];
      if (paidCount !== dates.length) {
        fail(`${name}: sheet says ${paidCount} instalments paid, the config has dates for ${dates.length}`);
      }
      dates.forEach((d, i) => {
        plan.payments.push({
          importKey: key(m, `:pay${i + 1}`),
          assetKey: key(m),
          rec: {
            payment_date: d,
            amount: money(unitC),
            paid_from: account,
            instalment_no: i + 1,
            bank_match: mc.paymentBankMatch,
            note: `Instalment ${i + 1} of ${count}`,
          },
        });
      });
    } else {
      if (paidCount !== 1) fail(`${name}: one-off purchase with ${paidCount} payments`);
      plan.payments.push({
        importKey: key(m, ":pay1"),
        assetKey: key(m),
        rec: {
          payment_date: firstDate,
          amount: money(totalC),
          paid_from: account,
          instalment_no: null,
          bank_match: mc.paymentBankMatch,
          note: mc.oneOffPaymentNote,
        },
      });
    }
  }

  // ---- Income & funding -> income_entries (Website is derived from orders) ----
  for (const r of rowsOf(fx, cfg.income.tab)) {
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
    const rule =
      cfg.income.rules.find((x) => x.type === type && (x.from === undefined || x.from === from)) ??
      fail(`Income #${r.num}: no config rule for "${from}" / "${type}"`);
    const given = dateOf(r, "Date");
    const sheetNote = str(r.cells["Note"]);
    let note = rule.notePrefix ? joinNote(rule.notePrefix, sheetNote) : sheetNote;
    const extra = rule.noteAppend?.[String(r.num)];
    if (extra) note = (note ? `${note}. ` : "") + extra;
    plan.incomes.push({
      importKey: key(r),
      hash: r.hash,
      rec: {
        entry_date: given ?? cfg.income.undatedDate,
        date_is_estimate: given ? 0 : 1,
        kind: rule.kind,
        source_name: from,
        amount: money(amountC),
        account: rule.account,
        project_tag: rule.projectTag ?? null,
        bank_match: rule.bankMatch,
        note: limited(`Income #${r.num} note`, note, 500),
      },
    });
    if (!given) plan.imputed.push(`Income #${r.num} (${from}) -> ${cfg.income.undatedDate}`);
  }

  // Hard guard: Website must never reach the insert list.
  for (const i of plan.incomes) {
    if (i.rec.source_name.trim().toLowerCase().includes("website")) fail(`refusing to import income row "${i.rec.source_name}"`);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Private config: load, validate, resolve expected totals
// ---------------------------------------------------------------------------
function loadConfig(configPath: string): Config {
  if (!fs.existsSync(configPath)) {
    fail(
      `private config not found: ${configPath}\n` +
        `This importer holds no business data. Create the git-ignored file (default ` +
        `.planning/data/private/cost-tracker-config.json) or pass --config=<path>. Nothing was changed.`,
    );
  }
  let cfg: Config;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;
  } catch (e) {
    return fail(`private config ${configPath} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const bad = (what: string): never => fail(`private config ${configPath}: ${what}`);
  const acct = (v: unknown, what: string) => {
    if (!ACCOUNTS.includes(v as Account)) bad(`${what} must be one of ${ACCOUNTS.join(", ")} (got ${String(v)})`);
  };
  const match = (v: unknown, what: string) => {
    if (!MATCHES.includes(v as BankMatch)) bad(`${what} must be one of ${MATCHES.join(", ")} (got ${String(v)})`);
  };
  if (!cfg.supplies?.tab) bad('missing "supplies.tab"');
  acct(cfg.supplies.paidFrom, "supplies.paidFrom");
  if (cfg.supplies.asset) acct(cfg.supplies.asset.paidFrom, "supplies.asset.paidFrom");
  if (!Array.isArray(cfg.fixedTabs)) bad('missing "fixedTabs" array');
  cfg.fixedTabs.forEach((t, i) => {
    acct(t.paidFrom, `fixedTabs[${i}].paidFrom`);
    match(t.bankMatch, `fixedTabs[${i}].bankMatch`);
  });
  if (!Array.isArray(cfg.projectTabs)) bad('missing "projectTabs" array');
  cfg.projectTabs.forEach((t, i) => {
    acct(t.defaultRule?.paidFrom, `projectTabs[${i}].defaultRule.paidFrom`);
    for (const [n, rule] of Object.entries(t.rowRules ?? {})) if (rule.paidFrom) acct(rule.paidFrom, `projectTabs[${i}].rowRules.${n}.paidFrom`);
  });
  if (!cfg.machines?.tab || !Array.isArray(cfg.machines.names)) bad('missing "machines.tab" / "machines.names"');
  acct(cfg.machines.defaultPaidFrom, "machines.defaultPaidFrom");
  match(cfg.machines.paymentBankMatch, "machines.paymentBankMatch");
  if (!cfg.income?.tab || !Array.isArray(cfg.income.rules)) bad('missing "income.tab" / "income.rules"');
  cfg.income.rules.forEach((r, i) => {
    acct(r.account, `income.rules[${i}].account`);
    match(r.bankMatch, `income.rules[${i}].bankMatch`);
  });
  if (!cfg.expected?.expenseTabs || !cfg.expected.assets || !cfg.expected.payments || !cfg.expected.income) bad('missing "expected" block');
  return cfg;
}

interface Expected {
  expenseRows: number;
  expenseCents: number;
  byTab: Record<string, { n: number; cents: number }>;
  suppliesByMatch: Record<string, number>;
  assetRows: number;
  assetCents: number;
  paymentRows: number;
  paymentCents: number;
  instalmentOwedCents: number;
  incomeByKind: Record<string, number>;
  incomeRows: number;
}

/** Resolve the config's expected block to integer cents. Summary figures come from the fixture itself. */
function resolveExpected(cfg: Config, fx: Fixture, plan: Plan): Expected {
  const supplyAssetCents = plan.supplyAsset?.cents ?? 0;
  const moneyOf = (spec: MoneySpec, label: string, applyAsset = true): number => {
    if (typeof spec === "number") return Math.round(spec * 100);
    const v = fx.summary?.[spec.summary];
    if (typeof v !== "number") return fail(`expected ${label}: fixture summary has no figure "${spec.summary}"`);
    let c = Math.round(v * 100);
    if (applyAsset && spec.minusAsset) c -= supplyAssetCents;
    if (applyAsset && spec.plusAsset) c += supplyAssetCents;
    return c;
  };
  const e = cfg.expected;
  const byTab: Expected["byTab"] = {};
  for (const [tab, t] of Object.entries(e.expenseTabs)) byTab[`ct26:${tab}`] = { n: t.rows, cents: moneyOf(t.total, `expenses ${tab}`) };
  const plannedTabs = new Set(plan.expenses.map((x) => `ct26:${x.tab}`));
  for (const t of plannedTabs) if (!byTab[t]) fail(`private config has no expected total for planned expense tab ${t}`);
  const suppliesByMatch: Record<string, number> = {};
  for (const [m, spec] of Object.entries(e.suppliesByMatch ?? {})) {
    suppliesByMatch[m] = moneyOf(spec as MoneySpec, `supplies ${m}`, plan.supplyAsset?.match === m);
  }
  const incomeByKind: Record<string, number> = {};
  for (const [k, spec] of Object.entries(e.income.byKind)) incomeByKind[k] = moneyOf(spec, `income ${k}`);
  return {
    expenseRows: Object.values(byTab).reduce((s, t) => s + t.n, 0),
    expenseCents: Object.values(byTab).reduce((s, t) => s + t.cents, 0),
    byTab,
    suppliesByMatch,
    assetRows: e.assets.rows,
    assetCents: moneyOf(e.assets.total, "assets"),
    paymentRows: e.payments.rows,
    paymentCents: moneyOf(e.payments.total, "asset_payments"),
    instalmentOwedCents: moneyOf(e.instalmentOwed, "instalments owed"),
    incomeByKind,
    incomeRows: e.income.rows,
  };
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
  config: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { commit: false, updateDrift: false, allowProd: false, expectDb: null, fixture: null, config: null };
  for (const arg of argv) {
    if (arg === "--commit") a.commit = true;
    else if (arg === "--dry-run") a.commit = false;
    else if (arg === "--update-drift") a.updateDrift = true;
    else if (arg === "--allow-prod") a.allowProd = true;
    else if (arg.startsWith("--expect-db=")) a.expectDb = arg.slice("--expect-db=".length);
    else if (arg.startsWith("--fixture=")) a.fixture = arg.slice("--fixture=".length);
    else if (arg.startsWith("--config=")) a.config = arg.slice("--config=".length);
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
async function assertTotals(conn: Conn, plan: Plan, EXPECTED: Expected): Promise<{ problems: string[]; lines: string[] }> {
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
    `SELECT bank_match m, ROUND(SUM(amount)*100) c FROM expenses WHERE import_key LIKE ? GROUP BY bank_match`,
    [`ct26:${plan.suppliesKeyTab ?? ""}:%`],
  );
  const matchMap = new Map((byMatch as Row[]).map((r) => [String(r.m), Number(r.c)]));
  for (const [m, want] of Object.entries(EXPECTED.suppliesByMatch)) check(`  supplies bank_match ${m}`, matchMap.get(m) ?? 0, want);

  const a = await one(`SELECT COUNT(*) n, IFNULL(ROUND(SUM(amount)*100),0) c FROM assets WHERE import_key LIKE 'ct26:%'`);
  check("assets rows", Number(a.n), EXPECTED.assetRows, false);
  check("assets total (incl. the asset taken from supplies)", Number(a.c), EXPECTED.assetCents);
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

  // Config first: no config means no business data, so stop before anything else.
  const configPath = path.resolve(args.config ?? path.join(root, ".planning", "data", "private", "cost-tracker-config.json"));
  const cfg = loadConfig(configPath);

  const fixturePath = args.fixture
    ? path.resolve(args.fixture)
    : path.resolve(path.dirname(configPath), cfg.fixture ?? "cost-tracker-2026-11.json");
  if (!fs.existsSync(fixturePath)) {
    throw new Error(
      `fixture not found: ${fixturePath}. The raw fixture is git-ignored (private data); ` +
        `generate it with the private extractor (see the config folder) or pass --fixture=<path>.`,
    );
  }
  const fx = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Fixture;
  console.log(`fixture: ${fx.fixture} (${fx.rows.length} rows, from ${fx.source})`);

  // 1. Pure mapping + early sanity on the planned rows.
  const plan = buildPlan(fx, cfg);
  const expected = resolveExpected(cfg, fx, plan);
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

      const { problems, lines } = await assertTotals(conn, plan, expected);
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
