import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listPayouts } from "@/actions/admin-accounting";
import { BRAND } from "@/lib/brand";
import { fmtMoney } from "@/lib/accounting-format";
import { ACCOUNT_LABELS, type AccountKey } from "@/lib/accounting-types";
import { DeleteButton } from "@/components/admin/accounting/delete-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Transfers",
  robots: { index: false, follow: false },
};

function label(k: string | undefined): string {
  return ACCOUNT_LABELS[(k ?? "paypal") as AccountKey] ?? k ?? "PayPal";
}

export default async function AdminPayoutsListPage() {
  await requireAdmin();
  const rows = await listPayouts();
  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Transfers</h1>
            <p className="mt-1 text-slate-600">
              Money you moved between your own accounts, for example PayPal to bank. Not income and not an expense.
            </p>
          </div>
          <Link
            href="/admin/accounting/payouts/new"
            className="inline-flex items-center justify-center rounded-full px-5 font-semibold text-white min-h-[44px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Add transfer
          </Link>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#ffffff" }}>
            <p className="text-lg font-bold">No transfers yet.</p>
            <p className="mt-1 text-sm text-slate-600">
              Add one when you withdraw from PayPal or pay off the credit card.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
            {/* Desktop table, hidden on mobile */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ backgroundColor: `${BRAND.ink}0d` }}>
                    <th className="p-3">Date</th>
                    <th className="p-3">From</th>
                    <th className="p-3">Into</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">Note</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-black/10 hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap font-mono text-xs">{r.payoutDate}</td>
                      <td className="p-3">{label(r.fromAccount)}</td>
                      <td className="p-3">{label(r.paidInto)}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">{fmtMoney(r.amount)}</td>
                      <td className="p-3 text-slate-700">{r.note}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/accounting/payouts/${r.id}/edit`}
                            className="inline-flex items-center justify-center rounded-full border-2 px-4 text-xs font-semibold min-h-[44px]"
                            style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                          >
                            Edit
                          </Link>
                          <DeleteButton kind="payout" id={r.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list, shown below md */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => (
                <div key={r.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold">{r.payoutDate}</span>
                    <span className="text-right tabular-nums font-bold">{fmtMoney(r.amount)}</span>
                  </div>
                  <p className="text-sm font-semibold">
                    {label(r.fromAccount)} to {label(r.paidInto)}
                  </p>
                  {r.note ? <p className="text-sm text-slate-700">{r.note}</p> : null}
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={`/admin/accounting/payouts/${r.id}/edit`}
                      className="inline-flex flex-1 items-center justify-center rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
                      style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                    >
                      Edit
                    </Link>
                    <DeleteButton kind="payout" id={r.id} />
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
