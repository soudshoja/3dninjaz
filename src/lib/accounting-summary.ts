import "server-only";

import { db } from "@/lib/db";
import { expenses, incomeEntries } from "@/lib/db/schema";
import { and, gte, lte, desc, type SQL } from "drizzle-orm";
import { toNum } from "@/lib/profit";
import type { DateRange } from "@/lib/date-range";
import {
  getAccountingOverview,
  getNetPosition,
  getAssetsProgress,
  type CashSummary,
  type GrossMarginSummary,
  type NetPosition,
  type AssetProgress,
} from "@/lib/accounting";
import { round2 } from "@/lib/accounting-math";
import {
  EXPENSE_CATEGORY_LABELS,
  BANK_MATCH_VALUES,
  PROFIT_INCOME_KINDS,
  type BankMatch,
  type ExpenseCategory,
  type IncomeKind,
} from "@/lib/accounting-types";

// ============================================================================
// Net Position report: the replica of the owner's cost-tracker "Summary" tab.
//
// Cost sections are mutually exclusive, in this precedence:
//   1. Projects   expenses carrying a project_tag (shown per tag)
//   2. Designer   category = design
//   3. Marketing  category = marketing
//   4. Supplies   everything else (materials, packaging, consumables,
//                 equipment, fees, utilities, shipping, other)
// so Projects + Designer + Marketing + Supplies = all expenses in range.
//
// Income lines list every income entry of kind project | event | other, and
// the Projects block repeats the tagged ones as a profit memo. Website sales
// are DERIVED from orders and shown as their own line, never stored.
// ============================================================================

export type GroupRow = { key: string; label: string; total: number; count: number };

export type BankMatchRow = { status: BankMatch; total: number; count: number };

export type ProjectRow = {
  tag: string;
  costs: number;
  income: number;
  profit: number;
};

export type IncomeLine = {
  id: string;
  date: string;
  dateIsEstimate: boolean;
  kind: IncomeKind;
  source: string;
  amount: number;
  projectTag: string | null;
};

export type SummaryReport = {
  cash: CashSummary;
  margin: GrossMarginSummary;
  position: NetPosition;
  machines: {
    rows: AssetProgress[];
    total: number;
    paidInRange: number;
    stillToPay: number;
  };
  supplies: {
    total: number;
    bySource: GroupRow[];
    bySubcategory: GroupRow[];
    byBankMatch: BankMatchRow[];
  };
  designer: { total: number; count: number };
  marketing: { total: number; count: number };
  projects: ProjectRow[];
  income: {
    websiteSales: number;
    lines: IncomeLine[];
    linesTotal: number;
    total: number;
  };
  funding: { lines: IncomeLine[]; capitalIn: number; capitalOut: number };
  totals: {
    income: number;
    costs: number;
    paypalFees: number;
    netProfit: number;
  };
};

function ymdConds(col: Parameters<typeof gte>[0], range: DateRange): SQL[] {
  const conds: SQL[] = [];
  if (range.from) conds.push(gte(col, range.from));
  if (range.to) conds.push(lte(col, range.to));
  return conds;
}

function addTo(map: Map<string, GroupRow>, key: string, label: string, amount: number) {
  const g = map.get(key) ?? { key, label, total: 0, count: 0 };
  g.total += amount;
  g.count += 1;
  map.set(key, g);
}

function sortedGroups(map: Map<string, GroupRow>): GroupRow[] {
  return [...map.values()]
    .map((g) => ({ ...g, total: round2(g.total) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.label.localeCompare(b.label));
}

export async function getSummaryReport(range: DateRange): Promise<SummaryReport> {
  const { cash, margin } = await getAccountingOverview(range);

  const [position, machineRows, expRows, incRows] = await Promise.all([
    getNetPosition(range, cash),
    getAssetsProgress(range),
    db
      .select({
        category: expenses.category,
        subcategory: expenses.subcategory,
        supplierName: expenses.supplierName,
        amount: expenses.amount,
        bankMatch: expenses.bankMatch,
        projectTag: expenses.projectTag,
      })
      .from(expenses)
      .where(and(...ymdConds(expenses.expenseDate, range))),
    db
      .select()
      .from(incomeEntries)
      .where(and(...ymdConds(incomeEntries.entryDate, range)))
      .orderBy(desc(incomeEntries.entryDate)),
  ]);

  // ---- Costs --------------------------------------------------------------
  const bySource = new Map<string, GroupRow>();
  const bySub = new Map<string, GroupRow>();
  const matchTotals = new Map<BankMatch, BankMatchRow>(
    BANK_MATCH_VALUES.map((m) => [m, { status: m, total: 0, count: 0 }]),
  );
  const projectCosts = new Map<string, number>();
  let suppliesTotal = 0;
  let designer = { total: 0, count: 0 };
  let marketing = { total: 0, count: 0 };

  for (const e of expRows) {
    const amt = toNum(e.amount);
    const tag = e.projectTag?.trim();
    if (tag) {
      projectCosts.set(tag, (projectCosts.get(tag) ?? 0) + amt);
      continue;
    }
    if (e.category === "design") {
      designer = { total: designer.total + amt, count: designer.count + 1 };
      continue;
    }
    if (e.category === "marketing") {
      marketing = { total: marketing.total + amt, count: marketing.count + 1 };
      continue;
    }
    suppliesTotal += amt;
    const src = e.supplierName?.trim() || "No supplier recorded";
    addTo(bySource, src.toLowerCase(), src, amt);
    const sub = e.subcategory?.trim();
    const subLabel = sub || EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category;
    addTo(bySub, subLabel.toLowerCase(), subLabel, amt);
    const mt = matchTotals.get(e.bankMatch as BankMatch);
    if (mt) {
      mt.total += amt;
      mt.count += 1;
    }
  }

  // ---- Income and funding -------------------------------------------------
  const incomeLines: IncomeLine[] = [];
  const fundingLines: IncomeLine[] = [];
  const projectIncome = new Map<string, number>();
  let capitalIn = 0;
  let capitalOut = 0;
  for (const r of incRows) {
    const line: IncomeLine = {
      id: r.id,
      date: r.entryDate,
      dateIsEstimate: !!r.dateIsEstimate,
      kind: r.kind,
      source: r.sourceName,
      amount: toNum(r.amount),
      projectTag: r.projectTag?.trim() || null,
    };
    if ((PROFIT_INCOME_KINDS as readonly string[]).includes(r.kind)) {
      incomeLines.push(line);
      if (line.projectTag) {
        projectIncome.set(line.projectTag, (projectIncome.get(line.projectTag) ?? 0) + line.amount);
      }
    } else {
      fundingLines.push(line);
      if (r.kind === "capital_in") capitalIn += line.amount;
      else capitalOut += line.amount;
    }
  }
  const linesTotal = incomeLines.reduce((s, l) => s + l.amount, 0);

  const tags = new Set<string>([...projectCosts.keys(), ...projectIncome.keys()]);
  const projects: ProjectRow[] = [...tags]
    .map((tag) => {
      const costs = projectCosts.get(tag) ?? 0;
      const income = projectIncome.get(tag) ?? 0;
      return { tag, costs: round2(costs), income: round2(income), profit: round2(income - costs) };
    })
    .sort((a, b) => a.tag.localeCompare(b.tag));

  const machines = {
    rows: machineRows,
    total: round2(machineRows.reduce((s, a) => s + a.total, 0)),
    paidInRange: round2(machineRows.reduce((s, a) => s + a.paidInRange, 0)),
    stillToPay: round2(machineRows.reduce((s, a) => s + a.stillToPay, 0)),
  };

  return {
    cash,
    margin,
    position,
    machines,
    supplies: {
      total: round2(suppliesTotal),
      bySource: sortedGroups(bySource),
      bySubcategory: sortedGroups(bySub),
      byBankMatch: [...matchTotals.values()].map((m) => ({ ...m, total: round2(m.total) })),
    },
    designer: { total: round2(designer.total), count: designer.count },
    marketing: { total: round2(marketing.total), count: marketing.count },
    projects,
    income: {
      websiteSales: cash.productSales,
      lines: incomeLines,
      linesTotal: round2(linesTotal),
      total: round2(cash.productSales + linesTotal),
    },
    funding: { lines: fundingLines, capitalIn: round2(capitalIn), capitalOut: round2(capitalOut) },
    totals: {
      income: round2(cash.productSales + cash.otherIncome),
      costs: round2(cash.expensesTotal + cash.paypalFees),
      paypalFees: cash.paypalFees,
      netProfit: cash.netProfit,
    },
  };
}
