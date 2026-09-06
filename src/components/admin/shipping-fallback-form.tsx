"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { updateFallbackRates } from "@/actions/admin-shipping";

type Row = {
  id: string;
  state: string;
  maxWeightKg: string;
  rate: string;
  source: "seed" | "learned" | "manual";
};

type Props = { rows: Row[] };

const SOURCE_LABEL: Record<Row["source"], string> = {
  seed: "Seeded estimate",
  learned: "Learned from a live Delyva quote",
  manual: "Set by you",
};

const SOURCE_COLOR: Record<Row["source"], string> = {
  seed: "#94A3B8", // slate — an estimate, not observed
  learned: BRAND.blue, // came from a real courier quote
  manual: BRAND.green, // operator override, never auto-updated
};

/**
 * Weight-bracketed shipping fallback grid.
 *
 * These rates are charged ONLY when a live Delyva quote is unavailable. They
 * are bracketed by weight because a single flat rate per state is wrong: the
 * same state quotes RM5.00 / 5.60 / 6.30 / 10.50 purely on parcel weight.
 *
 * Successful checkouts write their real cheapest price back into the matching
 * bracket (source "learned"), so the table tracks Delyva instead of drifting.
 * Anything edited here becomes "manual" and is never auto-overwritten.
 */
export function ShippingFallbackForm({ rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.rate])),
  );

  // Bracket ceilings, ascending — the grid columns.
  const brackets = useMemo(() => {
    const set = new Set(rows.map((r) => Number(r.maxWeightKg)));
    return [...set].sort((a, b) => a - b);
  }, [rows]);

  // State -> bracket -> row, preserving the server's state ordering.
  const byState = useMemo(() => {
    const map = new Map<string, Map<number, Row>>();
    for (const r of rows) {
      let inner = map.get(r.state);
      if (!inner) {
        inner = new Map<number, Row>();
        map.set(r.state, inner);
      }
      inner.set(Number(r.maxWeightKg), r);
    }
    return map;
  }, [rows]);

  const dirty = rows.filter((r) => (values[r.id] ?? r.rate) !== r.rate);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (dirty.length === 0) {
      setSaved(true);
      return;
    }

    const entries = dirty.map((r) => ({
      id: r.id,
      rate: (values[r.id] ?? r.rate).trim(),
    }));

    startTransition(async () => {
      const res = await updateFallbackRates(entries);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  if (rows.length === 0) {
    return (
      <section
        className="mt-8 rounded-2xl border-2 p-5"
        style={{ borderColor: BRAND.ink }}
      >
        <h2 className="font-[var(--font-heading)] text-xl">Fallback rates</h2>
        <p className="mt-2 text-sm text-slate-600">
          No fallback brackets exist yet. Run{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">
            node scripts/shipping-fallback-rates-migrate.cjs
          </code>{" "}
          to seed them.
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 rounded-2xl border-2 p-5"
      style={{ borderColor: BRAND.ink }}
    >
      <h2 className="font-[var(--font-heading)] text-xl">
        Fallback rates by weight
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Charged only when a live Delyva quote is unavailable. Parcel weight
        rounds <strong>up</strong> to the first column it fits. A zero cell
        counts as &ldquo;not configured&rdquo;, never as free shipping.
      </p>

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        {(Object.keys(SOURCE_LABEL) as Row["source"][]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SOURCE_COLOR[s] }}
            />
            {SOURCE_LABEL[s]}
          </span>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white p-2 text-left font-semibold">
                State
              </th>
              {brackets.map((b) => (
                <th key={b} className="p-2 text-left font-semibold">
                  &le; {b} kg
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...byState.entries()].map(([state, cells]) => (
              <tr key={state} className="border-t border-slate-200">
                <td className="sticky left-0 bg-white p-2 font-medium whitespace-nowrap">
                  {state}
                </td>
                {brackets.map((b) => {
                  const row = cells.get(b);
                  if (!row) {
                    return (
                      <td key={b} className="p-2 text-slate-400">
                        &mdash;
                      </td>
                    );
                  }
                  return (
                    <td key={b} className="p-2">
                      <label className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: SOURCE_COLOR[row.source] }}
                          title={SOURCE_LABEL[row.source]}
                        />
                        <span className="sr-only">
                          {state} up to {b} kg ({SOURCE_LABEL[row.source]})
                        </span>
                        <input
                          value={values[row.id] ?? row.rate}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                          inputMode="decimal"
                          className="w-20 rounded-lg border-2 px-2 py-1"
                          style={{ borderColor: BRAND.ink }}
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="mt-3 text-sm font-semibold" style={{ color: "#B91C1C" }}>
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p
          className="mt-3 text-sm font-semibold"
          style={{ color: BRAND.greenDark }}
        >
          Saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-full px-5 py-2 font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: BRAND.blue }}
      >
        {pending
          ? "Saving…"
          : dirty.length > 0
            ? `Save ${dirty.length} changed rate${dirty.length === 1 ? "" : "s"}`
            : "Save fallback rates"}
      </button>
    </form>
  );
}
