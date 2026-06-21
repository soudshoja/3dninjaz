import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listPayouts } from "@/actions/admin-accounting";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { DeleteButton } from "@/components/admin/accounting/delete-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Payouts",
  robots: { index: false, follow: false },
};

/** Capitalize the first letter of an account key (paidInto). */
function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function AdminPayoutsListPage() {
  await requireAdmin();
  const rows = await listPayouts();
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

        <header className="mt-3 mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Payouts
            </h1>
            <p className="mt-1 text-slate-600">
              Money withdrawn from PayPal into Bank/Cash.
            </p>
          </div>
          <Link
            href="/admin/accounting/payouts/new"
            className="inline-flex items-center justify-center rounded-full px-5 font-semibold text-white min-h-[44px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Add payout
          </Link>
        </header>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold">No payouts yet.</p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/* Desktop table — hidden on mobile */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Date</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">Into</th>
                    <th className="p-3">Note</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-black/10 hover:bg-slate-50"
                    >
                      <td className="p-3 whitespace-nowrap">{r.payoutDate}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">
                        {formatMYR(r.amount)}
                      </td>
                      <td className="p-3">{capitalize(r.paidInto)}</td>
                      <td className="p-3 text-slate-700">{r.note}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/admin/accounting/payouts/${r.id}/edit`}
                            className="inline-flex items-center underline decoration-dotted"
                            style={{ color: BRAND.ink }}
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

            {/* Mobile card list — shown below md */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => (
                <div key={r.id} className="p-3 space-y-1">
                  {/* Date + amount */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-xs font-semibold">{r.payoutDate}</span>
                    <span className="text-right tabular-nums font-bold">
                      {formatMYR(r.amount)}
                    </span>
                  </div>

                  {/* Into */}
                  <p className="text-xs text-slate-600">
                    Into:{" "}
                    <span className="font-semibold">{capitalize(r.paidInto)}</span>
                  </p>

                  {/* Note */}
                  {r.note ? (
                    <p className="text-sm text-slate-700">{r.note}</p>
                  ) : null}

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                    <Link
                      href={`/admin/accounting/payouts/${r.id}/edit`}
                      className="inline-flex items-center justify-center rounded-full px-4 text-sm font-semibold border-2 min-h-[44px] w-full sm:w-auto"
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
