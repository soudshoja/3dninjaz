import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { fmtMoney } from "@/lib/accounting-format";
import { describeRange, resolveEntryRange } from "@/lib/accounting-entry-range";
import { getPaypalLedger, type PaypalLedgerRowKind } from "@/lib/paypal-ledger";
import { DateRangePicker } from "@/components/admin/date-range-picker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · PayPal ledger",
  robots: { index: false, follow: false },
};

type SP = { from?: string; to?: string; range?: string };

const KIND_LABEL: Record<PaypalLedgerRowKind, string> = {
  order: "Order",
  refund: "Refund",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  expense: "Expense",
  income: "Income",
  asset_payment: "Asset payment",
};

function Card({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "#ffffff" }}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: accent ?? BRAND.ink }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export default async function PaypalLedgerPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveEntryRange(sp, "all");
  const ledger = await getPaypalLedger(range);
  const allTime = !range.from && !range.to;

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">PayPal ledger</h1>
          <p className="mt-1 text-slate-600">
            Everything that moved the PayPal balance. Order amounts, fees and net come from PayPal automatically.
          </p>
        </header>

        <div className="mb-4">
          <DateRangePicker basePath="/admin/accounting/paypal" />
        </div>

        <p className="mb-3 text-sm text-slate-600">{describeRange(range)}</p>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="PayPal totals">
          <Card
            label="Received from customers"
            value={fmtMoney(ledger.received)}
            hint="Net of PayPal fees"
            accent={BRAND.green}
          />
          <Card label="Fees paid" value={fmtMoney(ledger.fees)} hint="Taken by PayPal on each order" />
          <Card
            label="Balance"
            value={fmtMoney(ledger.balance)}
            hint={allTime ? "Net movement since records began" : "Net movement in this range"}
            accent={BRAND.blue}
          />
        </section>

        {ledger.notes.map((n) => (
          <p
            key={n}
            role="note"
            className="mt-3 rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
          >
            {n}
          </p>
        ))}

        <h2 className="mt-8 mb-3 font-bold text-xl">Ledger</h2>
        {ledger.rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#ffffff" }}>
            <p className="text-lg font-bold">No PayPal activity in this range.</p>
            <p className="mt-1 text-sm text-slate-600">Try a wider date range.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ backgroundColor: `${BRAND.ink}0d` }}>
                    <th className="p-3">Date</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Detail</th>
                    <th className="p-3 text-right">Gross</th>
                    <th className="p-3 text-right">Fee</th>
                    <th className="p-3 text-right">Effect on balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.rows.map((r) => (
                    <tr key={r.key} className="border-t border-black/10 hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap font-mono text-xs">{r.date}</td>
                      <td className="p-3 whitespace-nowrap">{KIND_LABEL[r.kind]}</td>
                      <td className="p-3 break-words max-w-[360px]">
                        {r.orderId ? (
                          <Link
                            href={`/admin/orders/${r.orderId}`}
                            className="underline decoration-dotted"
                            style={{ color: BRAND.ink }}
                          >
                            {r.label}
                          </Link>
                        ) : (
                          r.label
                        )}
                        {r.netPending ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            net pending
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap">
                        {r.gross == null ? "" : fmtMoney(r.gross)}
                      </td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap">
                        {r.fee == null ? "" : fmtMoney(r.fee)}
                      </td>
                      <td
                        className="p-3 text-right tabular-nums font-semibold whitespace-nowrap"
                        style={{ color: r.effect < 0 ? "#991b1b" : BRAND.ink }}
                      >
                        {fmtMoney(r.effect)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-black/10">
              {ledger.rows.map((r) => (
                <div key={r.key} className="p-4 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold">{r.date}</span>
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: r.effect < 0 ? "#991b1b" : BRAND.ink }}
                    >
                      {fmtMoney(r.effect)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold break-words">
                    {r.orderId ? (
                      <Link href={`/admin/orders/${r.orderId}`} className="underline decoration-dotted">
                        {r.label}
                      </Link>
                    ) : (
                      r.label
                    )}
                  </p>
                  <p className="text-xs text-slate-600">
                    {KIND_LABEL[r.kind]}
                    {r.gross != null ? ` · gross ${fmtMoney(r.gross)}` : ""}
                    {r.fee != null ? ` · fee ${fmtMoney(r.fee)}` : ""}
                    {r.netPending ? " · net pending" : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 className="mt-8 mb-1 font-bold text-xl">Card charges made through PayPal</h2>
        <p className="mb-3 text-sm text-slate-600">
          For information only. These went through PayPal but were paid by a card, so they are not in the balance above.
          {ledger.cardCharges.length > 0 ? (
            <>
              {" "}
              Total <strong className="tabular-nums">{fmtMoney(ledger.cardChargesTotal)}</strong>.
            </>
          ) : null}
        </p>
        {ledger.cardCharges.length === 0 ? (
          <div className="rounded-2xl p-6 text-center text-sm text-slate-600" style={{ backgroundColor: "#ffffff" }}>
            None in this range.
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
            <ul className="divide-y divide-black/10">
              {ledger.cardCharges.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-mono text-xs mr-2">{c.date}</span>
                    <span className="font-semibold break-words">{c.supplier || "No vendor"}</span>
                    {c.note ? <span className="ml-2 text-xs text-slate-600">{c.note}</span> : null}
                  </span>
                  <span className="tabular-nums font-semibold">{fmtMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
