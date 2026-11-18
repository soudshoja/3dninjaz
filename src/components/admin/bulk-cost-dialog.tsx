"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { applyBulkCost } from "@/actions/product-costs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyBulkMode,
  computeMargin,
  formatPct,
  formatRm,
  parseMoney,
  type BulkMode,
} from "@/lib/product-cost-math";
import type { BulkCostChange, OptionTarget, ProductCostRow } from "@/lib/product-cost-types";

/** One selected option (variant). `cost` is what it costs today: its own, else the product cost. */
export type BulkOptionItem = {
  key: string;
  target: OptionTarget;
  name: string;
  price: number | null;
  cost: number | null;
  hasOwnCost: boolean;
};

type ModeKind = "set" | "percent_of_price" | "adjust";

const MODE_OPTIONS: Array<{ kind: ModeKind; label: string; hint: string }> = [
  { kind: "set", label: "Set an exact cost", hint: "Every selected product gets the same cost." },
  {
    kind: "percent_of_price",
    label: "Cost is a % of price",
    hint: "For example 40% of each sell price.",
  },
  {
    kind: "adjust",
    label: "Raise or lower the cost",
    hint: "Change the existing costs by an amount or a percent.",
  },
];

/**
 * Bulk cost editor: choose a mode, see a BEFORE / AFTER preview with the new
 * margin and a flag for any product whose cost reaches its price, then apply.
 * The server recomputes every value from live data; this preview is only a
 * preview. The parent offers the 8 second Undo from `onApplied`.
 */
export function BulkCostDialog({
  open,
  onOpenChange,
  rows,
  optionItems = [],
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ProductCostRow[];
  optionItems?: BulkOptionItem[];
  onApplied: (changes: BulkCostChange[], skipped: number) => void;
}) {
  const [kind, setKind] = useState<ModeKind>("set");
  const [value, setValue] = useState("");
  const [direction, setDirection] = useState<"raise" | "lower">("raise");
  const [unit, setUnit] = useState<"rm" | "percent">("rm");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mode: BulkMode | null = useMemo(() => {
    const n = parseMoney(value);
    if (n === null) return null;
    if (kind === "set") return { kind: "set", amount: n };
    if (kind === "percent_of_price") return { kind: "percent_of_price", percent: n };
    const sign = direction === "raise" ? 1 : -1;
    return unit === "rm"
      ? { kind: "adjust_rm", delta: sign * n }
      : { kind: "adjust_percent", percent: sign * n };
  }, [kind, value, direction, unit]);

  // Products and options go through one preview; options carry their own price.
  const items = useMemo(
    () => [
      ...rows.map((r) => ({
        id: r.id,
        name: r.name,
        price: r.price,
        cost: r.cost,
        target: null as OptionTarget | null,
      })),
      ...optionItems.map((o) => ({
        id: o.key,
        name: o.name,
        price: o.price,
        cost: o.cost,
        target: o.target as OptionTarget | null,
      })),
    ],
    [rows, optionItems],
  );

  const preview = useMemo(
    () =>
      items.map((r) => {
        const next = mode ? applyBulkMode(mode, r.price, r.cost) : null;
        const changes = next !== null && next !== r.cost;
        return {
          row: r,
          next,
          changes,
          margin: computeMargin(r.price, next ?? r.cost),
          tooHigh: next !== null && r.price !== null && next >= r.price,
          noBase: mode !== null && next === null,
        };
      }),
    [items, mode],
  );

  const willChange = preview.filter((p) => p.changes).length;
  const tooHighCount = preview.filter((p) => p.changes && p.tooHigh).length;

  function apply() {
    if (!mode || willChange === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await applyBulkCost({
        ids: rows.map((r) => r.id),
        options: optionItems.map((o) => o.target),
        mode,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onApplied(res.changes, res.skipped);
      setValue("");
      onOpenChange(false);
    });
  }

  const valueLabel =
    kind === "set"
      ? "Cost (RM)"
      : kind === "percent_of_price"
        ? "Percent of price (%)"
        : unit === "rm"
          ? "Amount (RM)"
          : "Amount (%)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Edit cost for {items.length} {items.length === 1 ? "item" : "items"}
          </DialogTitle>
          <DialogDescription>
            Pick how to change the cost, check the preview, then apply. You can
            undo for 8 seconds afterwards.
            {optionItems.length > 0
              ? " An option with no cost of its own uses the product cost."
              : ""}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">How to change the cost</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODE_OPTIONS.map((o) => (
              <label
                key={o.kind}
                className={
                  "flex min-h-[44px] cursor-pointer flex-col gap-0.5 rounded-lg border p-3 " +
                  (kind === o.kind
                    ? "border-[var(--color-brand-blue)] bg-[var(--color-brand-blue)]/5"
                    : "border-[var(--color-brand-border)] hover:bg-muted/50")
                }
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="bulk-mode"
                    checked={kind === o.kind}
                    onChange={() => setKind(o.kind)}
                    className="h-4 w-4 accent-[var(--color-brand-blue)]"
                  />
                  {o.label}
                </span>
                <span className="pl-6 text-xs text-[var(--color-brand-text-muted)]">
                  {o.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          {kind === "adjust" && (
            <>
              <div className="space-y-1">
                <label htmlFor="bulk-direction" className="text-sm font-medium">
                  Direction
                </label>
                <select
                  id="bulk-direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "raise" | "lower")}
                  className="h-12 rounded-md border border-[var(--color-brand-border)] bg-white px-3 text-base md:h-10 md:text-sm"
                >
                  <option value="raise">Raise</option>
                  <option value="lower">Lower</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="bulk-unit" className="text-sm font-medium">
                  By
                </label>
                <select
                  id="bulk-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as "rm" | "percent")}
                  className="h-12 rounded-md border border-[var(--color-brand-border)] bg-white px-3 text-base md:h-10 md:text-sm"
                >
                  <option value="rm">Amount in RM</option>
                  <option value="percent">Percent</option>
                </select>
              </div>
            </>
          )}
          <div className="space-y-1">
            <label htmlFor="bulk-value" className="block text-sm font-medium">
              {valueLabel}
            </label>
            <input
              id="bulk-value"
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-12 w-full rounded-md border sm:w-36 border-[var(--color-brand-border)] bg-white px-3 text-right text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/40 md:h-10 md:text-sm"
              placeholder={kind === "set" ? "e.g. 3.50" : "e.g. 40"}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Preview</p>
            <p className="text-xs text-[var(--color-brand-text-muted)]" aria-live="polite">
              {mode === null
                ? "Enter a number to see the preview."
                : `${willChange} will change, ${items.length - willChange} stay the same.`}
            </p>
          </div>

          {tooHighCount > 0 && (
            <p
              className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {tooHighCount} {tooHighCount === 1 ? "item ends" : "items end"} up
              with a cost at or above the sell price.
            </p>
          )}

          {/* Phone: one line per item instead of a wide table */}
          <ul className="max-h-[34vh] divide-y divide-[var(--color-brand-border)] overflow-auto rounded-md border border-[var(--color-brand-border)] sm:hidden">
            {preview.map(({ row, next, changes, margin, tooHigh, noBase }) => (
              <li key={row.id} className="space-y-0.5 px-3 py-2.5">
                <p className="break-words text-base leading-snug">{row.name}</p>
                <p className="text-sm tabular-nums text-[var(--color-brand-text-muted)]">
                  {mode === null
                    ? row.cost === null
                      ? "No cost yet"
                      : `Cost ${formatRm(row.cost)}`
                    : noBase
                      ? "Nothing to change, it has no cost yet"
                      : next === null
                        ? ""
                        : `${row.cost === null ? "Was empty" : `Was ${formatRm(row.cost)}`}, now ${formatRm(next)}`}
                </p>
                {changes && margin && (
                  <p
                    className={
                      "text-sm tabular-nums " + (tooHigh ? "font-medium text-red-700" : "text-[var(--color-brand-text-muted)]")
                    }
                  >
                    New margin {formatPct(margin.pct)}
                    {tooHigh ? " (no profit)" : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden max-h-[38vh] overflow-auto rounded-md border border-[var(--color-brand-border)] sm:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left text-xs text-[var(--color-brand-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Product / option</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Cost before</th>
                  <th className="px-3 py-2 text-right font-medium">Cost after</th>
                  <th className="px-3 py-2 text-right font-medium">New margin</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {preview.map(({ row, next, changes, margin, tooHigh, noBase }) => (
                  <tr key={row.id} className="border-t border-[var(--color-brand-border)]">
                    <td className="max-w-[220px] truncate px-3 py-2 font-sans">{row.name}</td>
                    <td className="px-3 py-2 text-right">
                      {row.price === null ? "-" : formatRm(row.price)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.cost === null ? "-" : formatRm(row.cost)}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right " +
                        (changes ? "font-medium" : "text-[var(--color-brand-text-muted)]")
                      }
                    >
                      {mode === null
                        ? ""
                        : noBase
                          ? "No cost to change"
                          : next === null
                            ? "-"
                            : formatRm(next)}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right " + (tooHigh && changes ? "font-medium text-red-700" : "")
                      }
                    >
                      {changes && margin
                        ? `${formatPct(margin.pct)}${tooHigh ? " (no profit)" : ""}`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="h-12 text-base md:h-9 md:text-sm"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={apply}
            disabled={pending || mode === null || willChange === 0}
            className="h-12 bg-[var(--color-brand-ink)] text-base text-white hover:bg-[var(--color-brand-ink)]/90 md:h-9 md:text-sm"
          >
            {pending ? "Applying..." : `Apply to ${willChange} ${willChange === 1 ? "item" : "items"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
