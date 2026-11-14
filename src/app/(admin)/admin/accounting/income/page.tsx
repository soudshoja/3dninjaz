import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listIncomeEntries } from "@/actions/admin-income";
import { BRAND } from "@/lib/brand";
import { fmtMoney } from "@/lib/accounting-format";
import { describeRange } from "@/lib/accounting-entry-range";
import { resolveRange } from "@/lib/date-range";
import {
  ACCOUNT_KEYS,
  ACCOUNT_LABELS,
  INCOME_KINDS,
  INCOME_KIND_LABELS,
  PROFIT_INCOME_KINDS,
  type AccountKey,
  type IncomeKind,
} from "@/lib/accounting-types";
import { DeleteButton } from "@/components/admin/accounting/delete-button";
import { MatchBadge } from "@/components/admin/accounting/form-bits";
import { DateRangePicker } from "@/components/admin/date-range-picker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Income",
  robots: { index: false, follow: false },
};

type SP = { from?: string; to?: string; range?: string; kind?: string; account?: string; q?: string };

const selectCls = "rounded-xl border-2 bg-white px-3 text-sm min-h-[44px] w-full";
const border = { borderColor: `${BRAND.ink}33` };

function pickEnum<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export default async function AdminIncomePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp, { defaultPreset: "all" });
  const kind = pickEnum(sp.kind, INCOME_KINDS);
  const account = pickEnum(sp.account, ACCOUNT_KEYS);
  const q = sp.q?.slice(0, 100) || undefined;

  const rows = await listIncomeEntries({ from: range.from, to: range.to, kind, account, q });

  const signed = (k: IncomeKind, amount: string) => (k === "capital_out" ? -1 : 1) * Number(amount);
  const profitIncome = rows
    .filter((r) => (PROFIT_INCOME_KINDS as readonly string[]).includes(r.kind))
    .reduce((s, r) => s + Number(r.amount), 0);
  const funding = rows
    .filter((r) => r.kind === "capital_in" || r.kind === "capital_out")
    .reduce((s, r) => s + signed(r.kind, r.amount), 0);
  const estimateCount = rows.filter((r) => r.dateIsEstimate).length;
  const filtered = !!(kind || account || q);

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Income</h1>
            <p className="mt-1 text-slate-600">
              Money in that is not website sales: projects, events, other income and capital. Website sales are
              calculated from orders, so they never appear here.
            </p>
          </div>
          <Link
            href="/admin/accounting/income/new"
            className="inline-flex items-center justify-center rounded-full px-5 font-semibold text-white min-h-[44px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Add income
          </Link>
        </header>

        <div className="mb-3">
          <DateRangePicker current={range} />
        </div>

        <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          {sp.range ? <input type="hidden" name="range" value={sp.range} /> : null}
          {sp.from ? <input type="hidden" name="from" value={sp.from} /> : null}
          {sp.to ? <input type="hidden" name="to" value={sp.to} /> : null}
          <div>
            <label htmlFor="inf-q" className="block text-xs font-semibold mb-1">
              Search
            </label>
            <input
              id="inf-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              className="rounded-xl border-2 bg-white px-3 text-sm min-h-[44px] w-full"
              style={border}
            />
          </div>
          <div>
            <label htmlFor="inf-kind" className="block text-xs font-semibold mb-1">
              Kind
            </label>
            <select id="inf-kind" name="kind" defaultValue={kind ?? ""} className={selectCls} style={border}>
              <option value="">All kinds</option>
              {INCOME_KINDS.map((k) => (
                <option key={k} value={k}>
                  {INCOME_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inf-acct" className="block text-xs font-semibold mb-1">
              Received into
            </label>
            <select id="inf-acct" name="account" defaultValue={account ?? ""} className={selectCls} style={border}>
              <option value="">All accounts</option>
              {ACCOUNT_KEYS.map((a) => (
                <option key={a} value={a}>
                  {ACCOUNT_LABELS[a]}
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
                  pathname: "/admin/accounting/income",
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

        <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl p-4" style={{ backgroundColor: "#ffffff" }}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Income that counts towards profit</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(profitIncome)}</dd>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: "#ffffff" }}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Net capital (funding, not profit)</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(funding)}</dd>
          </div>
        </dl>
        <p className="mb-3 text-sm text-slate-600" aria-live="polite">
          <strong className="tabular-nums">{rows.length}</strong> {rows.length === 1 ? "entry" : "entries"} ·{" "}
          {describeRange(range)}
          {estimateCount > 0 ? ` · ${estimateCount} at estimated dates` : ""}
        </p>

        {rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#ffffff" }}>
            <p className="text-lg font-bold">{filtered || range.from || range.to ? "No income matches." : "No income recorded yet."}</p>
            <p className="mt-1 text-sm text-slate-600">
              {filtered || range.from || range.to
                ? "Try a wider date range or clear the filters."
                : "Add a project payment, bazaar takings or capital with the button above."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[860px] w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ backgroundColor: `${BRAND.ink}0d` }}>
                    <th className="p-3">Date</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Kind</th>
                    <th className="p-3">Project</th>
                    <th className="p-3">Into</th>
                    <th className="p-3">Bank</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-black/10 hover:bg-slate-50 align-top">
                      <td className="p-3 whitespace-nowrap font-mono text-xs">
                        {r.entryDate}
                        {r.dateIsEstimate ? (
                          <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            est.
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 max-w-[260px]">
                        <span className="font-semibold">{r.sourceName}</span>
                        {r.note ? <span className="block text-xs text-slate-600 break-words">{r.note}</span> : null}
                      </td>
                      <td className="p-3">{INCOME_KIND_LABELS[r.kind]}</td>
                      <td className="p-3">{r.projectTag || <span className="text-slate-400">None</span>}</td>
                      <td className="p-3">{ACCOUNT_LABELS[r.account as AccountKey]}</td>
                      <td className="p-3">
                        <MatchBadge value={r.bankMatch} />
                      </td>
                      <td className="p-3 text-right tabular-nums font-semibold whitespace-nowrap">
                        {fmtMoney(signed(r.kind, r.amount))}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/accounting/income/${r.id}/edit`}
                            className="inline-flex items-center justify-center rounded-full border-2 px-4 text-xs font-semibold min-h-[44px]"
                            style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                          >
                            Edit
                          </Link>
                          <DeleteButton kind="income" id={r.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold">
                      {r.entryDate}
                      {r.dateIsEstimate ? " (est.)" : ""}
                    </span>
                    <span className="font-bold tabular-nums shrink-0">{fmtMoney(signed(r.kind, r.amount))}</span>
                  </div>
                  <p className="text-sm font-semibold break-words">{r.sourceName}</p>
                  {r.note ? <p className="text-xs text-slate-600 break-words">{r.note}</p> : null}
                  <p className="text-xs text-slate-600">
                    {INCOME_KIND_LABELS[r.kind]} · into {ACCOUNT_LABELS[r.account as AccountKey]}
                    {r.projectTag ? ` · ${r.projectTag}` : ""}
                  </p>
                  <MatchBadge value={r.bankMatch} />
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={`/admin/accounting/income/${r.id}/edit`}
                      className="inline-flex flex-1 items-center justify-center rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
                      style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                    >
                      Edit
                    </Link>
                    <DeleteButton kind="income" id={r.id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
