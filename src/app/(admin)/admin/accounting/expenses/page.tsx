import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listExpenses, getExpenseFacets } from "@/actions/admin-accounting";
import { BRAND } from "@/lib/brand";
import { fmtMoney } from "@/lib/accounting-format";
import { describeRange, resolveEntryRange } from "@/lib/accounting-entry-range";
import {
  ACCOUNT_KEYS,
  ACCOUNT_LABELS,
  BANK_MATCH_LABELS,
  BANK_MATCH_VALUES,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type AccountKey,
  type ExpenseCategory,
} from "@/lib/accounting-types";
import { DeleteButton } from "@/components/admin/accounting/delete-button";
import { MatchBadge } from "@/components/admin/accounting/form-bits";
import { DateRangePicker } from "@/components/admin/date-range-picker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Expenses",
  robots: { index: false, follow: false },
};

type SP = {
  from?: string;
  to?: string;
  range?: string;
  category?: string;
  paidFrom?: string;
  bankMatch?: string;
  project?: string;
  q?: string;
};

const selectCls = "rounded-xl border-2 bg-white px-3 text-sm min-h-[44px] w-full";
const border = { borderColor: `${BRAND.ink}33` };

function pickEnum<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export default async function AdminExpensesListPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveEntryRange(sp, "all");
  const category = pickEnum(sp.category, EXPENSE_CATEGORIES);
  const paidFrom = pickEnum(sp.paidFrom, ACCOUNT_KEYS);
  const bankMatch = pickEnum(sp.bankMatch, BANK_MATCH_VALUES);
  const project = sp.project?.slice(0, 64) || undefined;
  const q = sp.q?.slice(0, 100) || undefined;

  const [rows, facets] = await Promise.all([
    listExpenses({
      from: range.from,
      to: range.to,
      category,
      paidFrom,
      bankMatch,
      projectTag: project,
      q,
    }),
    getExpenseFacets(),
  ]);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const estimateCount = rows.filter((r) => r.dateIsEstimate).length;
  const filtered = !!(category || paidFrom || bankMatch || project || q);

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Expenses</h1>
            <p className="mt-1 text-slate-600">
              Costs of running the business. Assets and transfers live on their own pages.
            </p>
          </div>
          <Link
            href="/admin/accounting/expenses/new"
            className="inline-flex items-center justify-center rounded-full px-5 font-semibold text-white min-h-[44px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Add expense
          </Link>
        </header>

        <div className="mb-3">
          <DateRangePicker basePath="/admin/accounting/expenses" />
        </div>

        <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
          {/* keep the active date range when filters are applied */}
          {sp.range ? <input type="hidden" name="range" value={sp.range} /> : null}
          {sp.from ? <input type="hidden" name="from" value={sp.from} /> : null}
          {sp.to ? <input type="hidden" name="to" value={sp.to} /> : null}
          <div>
            <label htmlFor="xf-q" className="block text-xs font-semibold mb-1">
              Search
            </label>
            <input
              id="xf-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              className="rounded-xl border-2 bg-white px-3 text-sm min-h-[44px] w-full"
              style={border}
            />
          </div>
          <div>
            <label htmlFor="xf-cat" className="block text-xs font-semibold mb-1">
              Category
            </label>
            <select id="xf-cat" name="category" defaultValue={category ?? ""} className={selectCls} style={border}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="xf-paid" className="block text-xs font-semibold mb-1">
              Paid from
            </label>
            <select id="xf-paid" name="paidFrom" defaultValue={paidFrom ?? ""} className={selectCls} style={border}>
              <option value="">All accounts</option>
              {ACCOUNT_KEYS.map((a) => (
                <option key={a} value={a}>
                  {ACCOUNT_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="xf-match" className="block text-xs font-semibold mb-1">
              Bank match
            </label>
            <select id="xf-match" name="bankMatch" defaultValue={bankMatch ?? ""} className={selectCls} style={border}>
              <option value="">Any status</option>
              {BANK_MATCH_VALUES.map((m) => (
                <option key={m} value={m}>
                  {BANK_MATCH_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="xf-proj" className="block text-xs font-semibold mb-1">
              Project
            </label>
            <select id="xf-proj" name="project" defaultValue={project ?? ""} className={selectCls} style={border}>
              <option value="">All projects</option>
              {facets.projectTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-full px-5 font-semibold text-white min-h-[44px]"
              style={{ backgroundColor: BRAND.ink }}
            >
              Apply filters
            </button>
            {filtered ? (
              <Link
                href={{
                  pathname: "/admin/accounting/expenses",
                  query: {
                    ...(sp.range ? { range: sp.range } : {}),
                    ...(sp.from ? { from: sp.from } : {}),
                    ...(sp.to ? { to: sp.to } : {}),
                  },
                }}
                className="inline-flex items-center justify-center rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
                style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <p className="mb-3 text-sm text-slate-600" aria-live="polite">
          <strong className="tabular-nums">{rows.length}</strong> {rows.length === 1 ? "expense" : "expenses"} ·{" "}
          {describeRange(range)} · total <strong className="tabular-nums">{fmtMoney(total)}</strong>
          {estimateCount > 0 ? ` · ${estimateCount} at estimated dates` : ""}
        </p>

        {rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#ffffff" }}>
            <p className="text-lg font-bold">{filtered || range.from || range.to ? "No expenses match." : "No expenses yet."}</p>
            <p className="mt-1 text-sm text-slate-600">
              {filtered || range.from || range.to
                ? "Try a wider date range or clear the filters."
                : "Add one with the button above."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
            {/* Desktop table, hidden on mobile */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ backgroundColor: `${BRAND.ink}0d` }}>
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Vendor and note</th>
                    <th className="p-3">Project</th>
                    <th className="p-3">Paid from</th>
                    <th className="p-3">Bank</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">Receipt</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const neg = Number(r.amount) < 0;
                    return (
                      <tr key={r.id} className="border-t border-black/10 hover:bg-slate-50 align-top">
                        <td className="p-3 whitespace-nowrap font-mono text-xs">
                          {r.expenseDate}
                          {r.dateIsEstimate ? (
                            <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              est.
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3">
                          {EXPENSE_CATEGORY_LABELS[r.category as ExpenseCategory] ?? r.category}
                          {r.subcategory ? <span className="block text-xs text-slate-500">{r.subcategory}</span> : null}
                        </td>
                        <td className="p-3 max-w-[280px]">
                          <span className="font-semibold">{r.supplierName || "No vendor"}</span>
                          {r.note ? <span className="block text-xs text-slate-600 break-words">{r.note}</span> : null}
                          {r.currency && r.currency !== "MYR" && r.amountOriginal ? (
                            <span className="block text-xs text-slate-500 tabular-nums">
                              {r.currency} {r.amountOriginal}
                              {r.fxRate ? ` at ${r.fxRate}` : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3">{r.projectTag || <span className="text-slate-400">None</span>}</td>
                        <td className="p-3 whitespace-nowrap">
                          {ACCOUNT_LABELS[r.paidFrom as AccountKey] ?? r.paidFrom}
                          {r.viaPaypal ? <span className="block text-xs text-slate-500">via PayPal</span> : null}
                        </td>
                        <td className="p-3">
                          <MatchBadge value={r.bankMatch} />
                        </td>
                        <td
                          className="p-3 text-right tabular-nums font-semibold whitespace-nowrap"
                          style={neg ? { color: "#166534" } : undefined}
                        >
                          {fmtMoney(r.amount)}
                          {neg ? <span className="block text-[11px] font-medium">refund or credit</span> : null}
                        </td>
                        <td className="p-3">
                          {r.sourceDocUrl ? (
                            <a
                              href={r.sourceDocUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline decoration-dotted"
                              style={{ color: BRAND.blue }}
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/accounting/expenses/${r.id}/edit`}
                              className="inline-flex items-center justify-center rounded-full border-2 px-4 text-xs font-semibold min-h-[44px]"
                              style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                            >
                              Edit
                            </Link>
                            <DeleteButton kind="expense" id={r.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list, shown below md */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => {
                const neg = Number(r.amount) < 0;
                return (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-mono text-xs font-semibold">
                        {r.expenseDate}
                        {r.dateIsEstimate ? " (est.)" : ""}
                      </span>
                      <span
                        className="font-bold tabular-nums shrink-0"
                        style={neg ? { color: "#166534" } : undefined}
                      >
                        {fmtMoney(r.amount)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold break-words">{r.supplierName || "No vendor"}</p>
                    {r.note ? <p className="text-xs text-slate-600 break-words">{r.note}</p> : null}
                    <p className="text-xs text-slate-600">
                      {EXPENSE_CATEGORY_LABELS[r.category as ExpenseCategory] ?? r.category}
                      {r.subcategory ? ` / ${r.subcategory}` : ""}
                      {" · "}
                      {ACCOUNT_LABELS[r.paidFrom as AccountKey] ?? r.paidFrom}
                      {r.viaPaypal ? " via PayPal" : ""}
                      {r.projectTag ? ` · ${r.projectTag}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <MatchBadge value={r.bankMatch} />
                      {neg ? <span className="text-[11px] font-medium text-green-800">refund or credit</span> : null}
                      {r.sourceDocUrl ? (
                        <a
                          href={r.sourceDocUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs underline decoration-dotted"
                          style={{ color: BRAND.blue }}
                        >
                          View receipt
                        </a>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Link
                        href={`/admin/accounting/expenses/${r.id}/edit`}
                        className="inline-flex flex-1 items-center justify-center rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
                        style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                      >
                        Edit
                      </Link>
                      <DeleteButton kind="expense" id={r.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
