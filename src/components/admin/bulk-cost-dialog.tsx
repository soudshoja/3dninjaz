"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { applyCostList } from "@/actions/product-costs";
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
import type { BulkCostChange, OptionTarget } from "@/lib/product-cost-types";

/**
 * One row of the dialog: a product, or one of its options (variants).
 * `cost` is what it costs today: its own, else (for an option) the product's.
 */
export type BulkItem = {
  id: string;
  name: string;
  price: number | null;
  cost: number | null;
  /** Options only: false means the cost shown is the product's, not its own. */
  hasOwnCost: boolean;
  /** Set for an option row. */
  target: OptionTarget | null;
};

/** A product with the rows to edit under it. `product` is null when only some options were picked. */
export type BulkGroup = {
  productId: string;
  name: string;
  product: BulkItem | null;
  options: BulkItem[];
};

type FillKind =
  | "none"
  | "set"
  | "percent_of_price"
  | "raise_rm"
  | "raise_percent"
  | "lower_rm"
  | "lower_percent";

// One plain-language picker instead of three cards plus sub-menus.
const FILL_OPTIONS: Array<{ kind: FillKind; label: string; unit: "RM" | "%"; example: string }> = [
  { kind: "set", label: "Set every cost to", unit: "RM", example: "3.50" },
  { kind: "percent_of_price", label: "Cost is % of price", unit: "%", example: "40" },
  { kind: "raise_rm", label: "Raise every cost by", unit: "RM", example: "0.50" },
  { kind: "raise_percent", label: "Raise every cost by", unit: "%", example: "10" },
  { kind: "lower_rm", label: "Lower every cost by", unit: "RM", example: "0.50" },
  { kind: "lower_percent", label: "Lower every cost by", unit: "%", example: "10" },
];

function toMode(kind: FillKind, n: number): BulkMode | null {
  switch (kind) {
    case "set":
      return { kind: "set", amount: n };
    case "percent_of_price":
      return { kind: "percent_of_price", percent: n };
    case "raise_rm":
      return { kind: "adjust_rm", delta: n };
    case "lower_rm":
      return { kind: "adjust_rm", delta: -n };
    case "raise_percent":
      return { kind: "adjust_percent", percent: n };
    case "lower_percent":
      return { kind: "adjust_percent", percent: -n };
    default:
      return null;
  }
}

/** Plain number for an input box ("3.50"), not "RM 3.50". */
function plain(n: number | null): string {
  return n === null ? "" : n.toFixed(2);
}

/**
 * Bulk cost editor. Every selected product is listed with ALL its options
 * (variants) under it, and every row has its own cost box. The quick fill at the
 * top only pre-fills the boxes; type in any box to change that one row alone.
 * A blank option box keeps the option on the product cost. The server writes
 * exactly the numbers shown here, and the parent offers the 8 second Undo.
 */
export function BulkCostDialog({
  open,
  onOpenChange,
  groups,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: BulkGroup[];
  onApplied: (changes: BulkCostChange[], skipped: number) => void;
}) {
  const [fillKind, setFillKind] = useState<FillKind>("set");
  const [fillValue, setFillValue] = useState("");
  // Row-by-row edits, keyed by item id. A blank box falls back to the quick fill.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fill = FILL_OPTIONS.find((o) => o.kind === fillKind) ?? FILL_OPTIONS[0];
  const mode = useMemo<BulkMode | null>(() => {
    const n = parseMoney(fillValue);
    return n === null ? null : toMode(fillKind, n);
  }, [fillKind, fillValue]);

  const allItems = useMemo(
    () => groups.flatMap((g) => [...(g.product ? [g.product] : []), ...g.options]),
    [groups],
  );

  // What each row would end up as.
  const state = useMemo(() => {
    const out = new Map<
      string,
      { next: number | null; changes: boolean; invalid: boolean; edited: boolean }
    >();
    for (const it of allItems) {
      const raw = edits[it.id];
      const typed = raw !== undefined && raw.trim() !== "";
      let next: number | null;
      let invalid = false;
      if (typed) {
        next = parseMoney(raw);
        invalid = next === null;
      } else {
        next = mode ? applyBulkMode(mode, it.price, it.cost) : null;
      }
      out.set(it.id, {
        next,
        changes: next !== null && next !== it.cost,
        invalid,
        edited: typed,
      });
    }
    return out;
  }, [allItems, edits, mode]);

  const willChange = allItems.filter((it) => state.get(it.id)?.changes).length;
  const invalidCount = allItems.filter((it) => state.get(it.id)?.invalid).length;
  const tooHighCount = allItems.filter((it) => {
    const s = state.get(it.id);
    return s?.changes && s.next !== null && it.price !== null && s.next >= it.price;
  }).length;
  const productCount = groups.filter((g) => g.product).length;
  const optionCount = groups.reduce((n, g) => n + g.options.length, 0);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setEdits({});
      setFillValue("");
      setError(null);
    }
    onOpenChange(next);
  }

  function apply() {
    if (willChange === 0 || invalidCount > 0) return;
    setError(null);
    const items = allItems.flatMap((it) => {
      const s = state.get(it.id);
      if (!s || !s.changes || s.next === null) return [];
      return [
        it.target
          ? {
              productId: it.target.productId,
              option: { fieldId: it.target.fieldId, value: it.target.value },
              cost: s.next,
            }
          : { productId: it.id, cost: s.next },
      ];
    });
    startTransition(async () => {
      const res = await applyCostList({ items });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onApplied(res.changes, res.skipped);
      handleOpenChange(false);
    });
  }

  function costBox(it: BulkItem, label: string) {
    const s = state.get(it.id);
    const raw = edits[it.id];
    // Show the edit as typed, else the number this row will have, else today's own cost.
    const shown =
      raw !== undefined
        ? raw
        : s?.changes && s.next !== null
          ? plain(s.next)
          : it.target && !it.hasOwnCost
            ? ""
            : plain(it.cost);
    return (
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={s?.invalid || undefined}
        value={shown}
        placeholder={
          s?.changes && s.next !== null
            ? plain(s.next)
            : it.target && !it.hasOwnCost
              ? plain(it.cost)
              : "0.00"
        }
        onChange={(e) => setEdits((prev) => ({ ...prev, [it.id]: e.target.value }))}
        className={
          "h-12 w-28 shrink-0 rounded-md border bg-white px-3 text-right text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/40 md:h-10 md:text-sm " +
          (s?.invalid
            ? "border-red-500"
            : s?.edited
              ? "border-[var(--color-brand-blue)]"
              : "border-[var(--color-brand-border)]")
        }
      />
    );
  }

  function meta(it: BulkItem) {
    const s = state.get(it.id);
    const next = s?.changes ? s.next : null;
    const margin = computeMargin(it.price, next ?? it.cost);
    const noProfit = next !== null && it.price !== null && next >= it.price;
    const bits: string[] = [];
    bits.push(it.price === null ? "No price set" : `Sells ${formatRm(it.price)}`);
    if (s?.changes) {
      bits.push(it.cost === null ? "was empty" : `was ${formatRm(it.cost)}`);
    } else if (it.target && !it.hasOwnCost) {
      bits.push(it.cost === null ? "no cost yet" : `uses product cost ${formatRm(it.cost)}`);
    } else if (it.cost === null) {
      bits.push("no cost yet");
    }
    return (
      <p className="text-sm text-[var(--color-brand-text-muted)]">
        {bits.join(", ")}
        {s?.changes && margin ? (
          <span className={noProfit ? "font-medium text-red-700" : ""}>
            {", margin "}
            {formatPct(margin.pct)}
            {noProfit ? " (no profit)" : ""}
          </span>
        ) : null}
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto overflow-x-hidden sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>
            Edit costs
            <span className="ml-2 text-sm font-normal text-[var(--color-brand-text-muted)]">
              {productCount > 0 ? `${productCount} ${productCount === 1 ? "product" : "products"}` : ""}
              {productCount > 0 && optionCount > 0 ? ", " : ""}
              {optionCount > 0 ? `${optionCount} ${optionCount === 1 ? "variant" : "variants"}` : ""}
            </span>
          </DialogTitle>
          <DialogDescription>
            Fill every row at once, then change any row on its own. You can undo for 8
            seconds afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="bulk-fill-kind" className="block text-sm font-medium">
            Quick fill
          </label>
          <div className="flex gap-2">
            <select
              id="bulk-fill-kind"
              value={`${fill.kind}`}
              onChange={(e) => setFillKind(e.target.value as FillKind)}
              className="h-12 w-0 min-w-0 flex-1 rounded-md border border-[var(--color-brand-border)] bg-white px-3 text-base md:h-10 md:text-sm"
            >
              {FILL_OPTIONS.map((o) => (
                <option key={o.kind} value={o.kind}>
                  {o.label} {o.unit === "RM" ? "(RM)" : "(%)"}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              aria-label={`${fill.label} ${fill.unit}`}
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              placeholder={fill.example}
              className="h-12 w-28 shrink-0 rounded-md border border-[var(--color-brand-border)] bg-white px-3 text-right text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/40 md:h-10 md:text-sm"
            />
          </div>
          <p className="text-sm text-[var(--color-brand-text-muted)]" aria-live="polite">
            {mode === null
              ? "Type a number to fill every box below, or just edit the boxes one by one."
              : `${willChange} will change, ${allItems.length - willChange} stay the same.`}
            {optionCount > 0 ? " A blank variant box keeps the product cost." : ""}
          </p>
        </div>

        {tooHighCount > 0 && (
          <p
            className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
            role="status"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {tooHighCount} {tooHighCount === 1 ? "item ends" : "items end"} up with a cost at or
            above the sell price.
          </p>
        )}

        <ul className="max-h-[48vh] divide-y divide-[var(--color-brand-border)] overflow-auto rounded-md border border-[var(--color-brand-border)]">
          {groups.map((g) => (
            <li key={g.productId}>
              {g.product ? (
                <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-base font-medium leading-snug">{g.name}</p>
                    {meta(g.product)}
                  </div>
                  {costBox(g.product, `Cost for ${g.name}`)}
                </div>
              ) : (
                <p className="bg-muted/40 px-3 py-2.5 text-base font-medium leading-snug break-words">
                  {g.name}
                </p>
              )}
              {g.options.length > 0 && (
                <ul className="divide-y divide-[var(--color-brand-border)]">
                  {g.options.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 pl-6 pr-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-base leading-snug md:text-sm">{o.name}</p>
                        {meta(o)}
                      </div>
                      {costBox(o, `Cost for ${g.name}, ${o.name}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {invalidCount > 0 && (
          <p className="text-sm text-red-600" role="alert">
            {invalidCount === 1 ? "One cost is" : `${invalidCount} costs are`} not a number. Use
            something like 3.50.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
            className="h-12 text-base md:h-9 md:text-sm"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={apply}
            disabled={pending || willChange === 0 || invalidCount > 0}
            className="h-12 bg-[var(--color-brand-ink)] text-base text-white hover:bg-[var(--color-brand-ink)]/90 md:h-9 md:text-sm"
          >
            {pending ? "Applying..." : `Apply to ${willChange} ${willChange === 1 ? "item" : "items"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
