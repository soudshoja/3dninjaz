import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listAssets } from "@/actions/admin-accounting";
import { BRAND } from "@/lib/brand";
import { fmtMoney } from "@/lib/accounting-format";
import { AssetCard } from "@/components/admin/accounting/asset-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Assets",
  robots: { index: false, follow: false },
};

export default async function AdminAssetsListPage() {
  await requireAdmin();
  const rows = await listAssets();
  const totalCost = rows.reduce((s, r) => s + Number(r.amount), 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidTotal, 0);
  const totalLeft = rows.reduce((s, r) => s + Math.max(r.remaining, 0), 0);

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Assets</h1>
            <p className="mt-1 text-slate-600">
              Machines and equipment. They do not count as expenses or reduce profit, but the money paid for them
              leaves the account it came from.
            </p>
          </div>
          <Link
            href="/admin/accounting/assets/new"
            className="inline-flex items-center justify-center rounded-full px-5 font-semibold text-white min-h-[44px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Add asset
          </Link>
        </header>

        {rows.length > 0 ? (
          <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["Total cost", totalCost],
              ["Paid so far", totalPaid],
              ["Still to pay", totalLeft],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-2xl p-4" style={{ backgroundColor: "#ffffff" }}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{label as string}</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(value as number)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#ffffff" }}>
            <p className="text-lg font-bold">No assets yet.</p>
            <p className="mt-1 text-sm text-slate-600">Add a printer or other equipment with the button above.</p>
          </div>
        ) : (
          <ul className="rounded-2xl overflow-hidden divide-y divide-black/10" style={{ backgroundColor: "#ffffff" }}>
            {rows.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
