import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listAssets } from "@/actions/admin-accounting";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { DeleteButton } from "@/components/admin/accounting/delete-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Assets",
  robots: { index: false, follow: false },
};

export default async function AdminAssetsListPage() {
  await requireAdmin();
  const rows = await listAssets();
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

        <header className="mt-3 mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Assets
            </h1>
            <p className="mt-1 text-slate-600">
              Assets are tracked separately and don&apos;t affect profit.
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

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold">No assets yet.</p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/* Desktop table — hidden on mobile */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[600px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Date</th>
                    <th className="p-3">Name</th>
                    <th className="p-3 text-right">Cost</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-black/10 hover:bg-slate-50"
                    >
                      <td className="p-3 whitespace-nowrap text-xs text-slate-700">
                        {r.assetDate}
                      </td>
                      <td className="p-3 font-semibold">{r.name}</td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMYR(r.amount)}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/accounting/assets/${r.id}/edit`}
                            className="inline-flex items-center justify-center rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
                            style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                          >
                            Edit
                          </Link>
                          <DeleteButton kind="asset" id={r.id} />
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
                <div key={r.id} className="p-3 space-y-2" style={{ color: BRAND.ink }}>
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <span className="font-semibold break-words min-w-0">
                      {r.name}
                    </span>
                    <span className="text-right tabular-nums font-semibold shrink-0">
                      {formatMYR(r.amount)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{r.assetDate}</p>
                  <div className="flex gap-2 pt-1">
                    <Link
                      href={`/admin/accounting/assets/${r.id}/edit`}
                      className="inline-flex flex-1 items-center justify-center rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
                      style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                    >
                      Edit
                    </Link>
                    <DeleteButton kind="asset" id={r.id} />
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
