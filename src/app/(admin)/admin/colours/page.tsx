import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listColours } from "@/actions/admin-colours";
import { BRAND } from "@/lib/brand";
import { ColourRowActions } from "@/components/admin/colour-row-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Colours",
  robots: { index: false, follow: false },
};

export default async function AdminColoursPage() {
  await requireAdmin();
  const rows = await listColours();
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Colours
            </h1>
            <p className="mt-1 text-slate-600">
              {rows.length} {rows.length === 1 ? "colour" : "colours"} (
              {activeCount} active)
            </p>
          </div>
          <Link
            href="/admin/colours/new"
            className="inline-flex items-center rounded-full px-6 py-3 text-sm font-bold text-white whitespace-nowrap min-h-[48px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            + New colour
          </Link>
        </header>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No colours yet.</p>
            <p className="text-sm text-slate-600">
              Run{" "}
              <code className="rounded bg-slate-100 px-2 py-1 text-xs font-mono">
                npx tsx --env-file=.env.local scripts/seed-colours.ts
              </code>{" "}
              to import the Bambu and Polymaker libraries, or click{" "}
              <strong>+ New colour</strong> to add one manually.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            <div className="overflow-x-auto">
              <table className="min-w-[820px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Swatch</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Brand</th>
                    <th className="p-3">Family</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-t border-black/10">
                      <td className="p-3">
                        <span
                          className="inline-block w-6 h-6 rounded-full"
                          style={{
                            backgroundColor: c.hex,
                            border: "1px solid #E2E8F0",
                          }}
                          aria-label={`Swatch ${c.hex}`}
                        />
                      </td>
                      <td className="p-3 font-semibold">{c.name}</td>
                      <td className="p-3">
                        <span
                          className="inline-flex items-center rounded-full border-2 px-2 py-0.5 text-xs font-semibold"
                          style={{
                            borderColor:
                              c.brand === "Bambu"
                                ? BRAND.green
                                : c.brand === "Polymaker"
                                  ? BRAND.blue
                                  : "#CBD5E1",
                            color: BRAND.ink,
                          }}
                        >
                          {c.brand}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {c.familyType}
                        {c.familySubtype ? ` · ${c.familySubtype}` : ""}
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-600">
                        {c.code ?? "—"}
                      </td>
                      <td className="p-3">
                        {c.isActive ? (
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                            style={{ backgroundColor: BRAND.green }}
                          >
                            Active
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                            style={{ backgroundColor: "#6b7280" }}
                          >
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <ColourRowActions
                          row={{
                            id: c.id,
                            name: c.name,
                            isActive: c.isActive,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
