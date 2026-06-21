import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listExpenses } from "@/actions/admin-accounting";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { DeleteButton } from "@/components/admin/accounting/delete-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Expenses",
  robots: { index: false, follow: false },
};

/** Capitalize a category / account code for display (e.g. "paypal" → "Paypal"). */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}

export default async function AdminExpensesListPage() {
  await requireAdmin();
  const rows = await listExpenses();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/admin/accounting"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to accounting
        </Link>

        <header className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Expenses
          </h1>
          <Link
            href="/admin/accounting/expenses/new"
            className="inline-flex items-center justify-center rounded-full px-5 font-semibold text-white min-h-[44px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Add expense
          </Link>
        </header>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold">No expenses yet.</p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/* Desktop table — hidden on mobile */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[820px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">Paid from</th>
                    <th className="p-3">Receipt</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-black/10 hover:bg-slate-50"
                    >
                      <td className="p-3 whitespace-nowrap font-mono text-xs">
                        {r.expenseDate}
                      </td>
                      <td className="p-3">{cap(r.category)}</td>
                      <td className="p-3">{r.supplierName || "—"}</td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMYR(r.amount)}
                      </td>
                      <td className="p-3">{cap(r.paidFrom)}</td>
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
                          "—"
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list — shown below md */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => (
                <div key={r.id} className="p-4 space-y-2">
                  {/* Date + amount */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold">
                      {r.expenseDate}
                    </span>
                    <span className="font-bold tabular-nums shrink-0">
                      {formatMYR(r.amount)}
                    </span>
                  </div>

                  {/* Category · paid from */}
                  <p className="text-xs text-slate-600">
                    {cap(r.category)}
                    {" · Paid from "}
                    <span className="font-semibold">{cap(r.paidFrom)}</span>
                  </p>

                  {/* Vendor */}
                  {r.supplierName ? (
                    <p className="text-sm">{r.supplierName}</p>
                  ) : null}

                  {/* Receipt */}
                  <p className="text-xs text-slate-600">
                    Receipt:{" "}
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
                      "—"
                    )}
                  </p>

                  {/* Actions */}
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
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
