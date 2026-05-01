"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { ColourRowActions } from "@/components/admin/colour-row-actions";
import type { ColourAdmin } from "@/lib/colours";
import { sortByShade } from "@/lib/colour-sort";

type Props = {
  rows: ColourAdmin[];
};

const BRANDS = ["All", "Bambu", "Polymaker", "Other"] as const;
const FAMILIES = ["All", "PLA", "PETG", "TPU", "CF", "Other"] as const;
const STATUSES = ["All", "Active", "Archived"] as const;

export function ColoursListClient({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<(typeof BRANDS)[number]>("All");
  const [family, setFamily] = useState<(typeof FAMILIES)[number]>("All");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = rows.filter((r) => {
      if (brand !== "All" && r.brand !== brand) return false;
      if (family !== "All" && r.familyType !== family) return false;
      if (status === "Active" && !r.isActive) return false;
      if (status === "Archived" && r.isActive) return false;
      if (q) {
        const hay = [
          r.name,
          r.familySubtype ?? "",
          r.code ?? "",
          r.brand,
          r.familyType,
          r.hex,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Shade-aware order — active rows first (so archived sit below), then
    // hue family + lightness within each group.
    const active = sortByShade(matches.filter((r) => r.isActive));
    const archived = sortByShade(matches.filter((r) => !r.isActive));
    return [...active, ...archived];
  }, [rows, query, brand, family, status]);

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
              Showing {filtered.length} of {rows.length} ({activeCount} active)
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

        {/* Filter bar */}
        <div
          className="mb-4 grid gap-3 rounded-2xl p-4 md:grid-cols-[1fr_auto_auto_auto_auto]"
          style={{ backgroundColor: "#ffffff" }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code, family, hex…"
            className="rounded-xl border-2 px-4 py-2 text-sm min-h-[44px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          />
          <select
            value={brand}
            onChange={(e) =>
              setBrand(e.target.value as (typeof BRANDS)[number])
            }
            className="rounded-xl border-2 px-3 py-2 text-sm min-h-[44px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          >
            {BRANDS.map((b) => (
              <option key={b} value={b}>
                Brand: {b}
              </option>
            ))}
          </select>
          <select
            value={family}
            onChange={(e) =>
              setFamily(e.target.value as (typeof FAMILIES)[number])
            }
            className="rounded-xl border-2 px-3 py-2 text-sm min-h-[44px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          >
            {FAMILIES.map((f) => (
              <option key={f} value={f}>
                Family: {f}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as (typeof STATUSES)[number])
            }
            className="rounded-xl border-2 px-3 py-2 text-sm min-h-[44px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                Status: {s}
              </option>
            ))}
          </select>
          {(query || brand !== "All" || family !== "All" || status !== "All") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setBrand("All");
                setFamily("All");
                setStatus("All");
              }}
              className="rounded-xl border-2 px-4 py-2 text-sm font-semibold min-h-[44px]"
              style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
            >
              Clear
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No colours match.</p>
            <p className="text-sm text-slate-600">
              Adjust the filters above, or click <strong>+ New colour</strong>{" "}
              to add one.
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
                    className="text-left sticky top-0 z-10"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3 w-[64px]">Swatch</th>
                    <th className="p-3">Name</th>
                    <th className="p-3 whitespace-nowrap">Brand</th>
                    <th className="p-3 whitespace-nowrap">Family</th>
                    <th className="p-3 whitespace-nowrap">Code</th>
                    <th className="p-3 whitespace-nowrap">Status</th>
                    <th className="p-3 text-right whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-t border-black/10">
                      <td className="p-3">
                        <span
                          className="inline-block w-8 h-8 rounded-full"
                          style={{
                            backgroundColor: c.hex,
                            border: "1px solid #E2E8F0",
                          }}
                          aria-label={`Swatch ${c.hex}`}
                          title={c.hex}
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-semibold leading-tight">
                          {c.name}
                        </div>
                        {c.familySubtype && (
                          <div className="text-xs text-slate-500 leading-tight mt-0.5">
                            {c.familySubtype}
                          </div>
                        )}
                      </td>
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
