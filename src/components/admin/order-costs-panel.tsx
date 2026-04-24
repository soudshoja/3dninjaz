"use client";

/**
 * Phase 10 (10-01) — Admin "Costs & Profit" panel.
 *
 * Shows revenue, per-line snapshotted unit_cost, extra_cost, totals, and the
 * computed margin. Supports:
 *   - Inline edit of each order_item.unit_cost (empty = clear = NULL).
 *   - Inline edit of orders.extra_cost + 255-char note.
 *
 * Both server actions (updateOrderItemCost, updateOrderExtraCost) return the
 * recomputed OrderProfitSummary so we refresh the displayed numbers
 * immediately without a full revalidate round-trip.
 *
 * This is intentionally a client component so the inline edits feel snappy —
 * the server still re-validates + requireAdmin()s on every submit.
 */

import { useMemo, useState, useTransition } from "react";
import { formatMYR } from "@/lib/format";
import { computeOrderCost } from "@/lib/profit";
import {
  updateOrderItemCost,
  updateOrderExtraCost,
  type OrderProfitSummary,
} from "@/actions/admin-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Save, X } from "lucide-react";

export type OrderCostsPanelItem = {
  id: string;
  productName: string;
  size: string | null;
  unitPrice: string;
  unitCost: string | null;
  quantity: number;
};

export function OrderCostsPanel({
  orderId,
  items: initialItems,
  extraCost: initialExtraCost,
  extraCostNote: initialExtraCostNote,
}: {
  orderId: string;
  items: OrderCostsPanelItem[];
  extraCost: string;
  extraCostNote: string | null;
}) {
  const [items, setItems] = useState<OrderCostsPanelItem[]>(initialItems);
  const [extraCost, setExtraCost] = useState<string>(initialExtraCost);
  const [extraCostNote, setExtraCostNote] = useState<string>(
    initialExtraCostNote ?? "",
  );

  // Track the id of the line being edited (null = none). Local-only UI state.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingExtra, setEditingExtra] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Always recompute the summary client-side so the numbers stay in lockstep
  // with unsaved edits. The server's returned summary is authoritative after
  // a save completes.
  const summary = useMemo(
    () =>
      computeOrderCost(
        items.map((i) => ({
          price: parseFloat(i.unitPrice),
          qty: i.quantity,
          unitCost: i.unitCost != null ? parseFloat(i.unitCost) : null,
        })),
        parseFloat(extraCost),
      ),
    [items, extraCost],
  );

  function applySummary(s: OrderProfitSummary) {
    // Sync local state to the server-authoritative summary in case the server
    // rounded / normalised differently from our client-side computation.
    // Keeping explicit — cheaper than re-reading the full order.
    // extra_cost is known locally; the totals are derived so no-op here.
    // Left as a hook in case we want to reflect server rounding later.
    void s;
  }

  const toneClass =
    summary.profitExShipping > 0
      ? "text-green-600"
      : summary.profitExShipping < 0
        ? "text-red-500"
        : "text-[var(--color-brand-text-muted)]";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-black/10 bg-white/60 p-4 md:p-5">
        <h3 className="font-[var(--font-heading)] text-lg mb-3">
          Costs &amp; Profit{" "}
          <span className="text-xs font-normal text-slate-500">
            (ex-shipping)
          </span>
        </h3>
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-slate-600">Revenue</dt>
          <dd className="text-right tabular-nums">
            {formatMYR(summary.revenueGross)}
          </dd>
          <dt className="text-slate-600">
            Item cost{" "}
            <span className="text-xs text-slate-500">
              ({items.length} {items.length === 1 ? "item" : "items"})
            </span>
          </dt>
          <dd className="text-right tabular-nums">
            {formatMYR(summary.itemCostTotal)}
          </dd>
          <dt className="text-slate-600">
            Extra cost
            {extraCostNote ? (
              <span className="block text-xs text-slate-500">
                {extraCostNote}
              </span>
            ) : null}
          </dt>
          <dd className="text-right tabular-nums">
            {formatMYR(summary.extraCost)}
          </dd>
          <dt className="col-span-2 border-t border-black/10 pt-2 mt-1" />
          <dt className="font-semibold">Profit</dt>
          <dd className={`text-right font-semibold tabular-nums ${toneClass}`}>
            {formatMYR(summary.profitExShipping)}{" "}
            <span className="text-xs font-normal">
              ({summary.marginPercent.toFixed(1)}%)
            </span>
          </dd>
        </dl>

        {summary.hasMissingCosts ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 border border-amber-200">
            Warning: {summary.missingCount}{" "}
            {summary.missingCount === 1 ? "item is" : "items are"} missing a
            cost price — the profit above treats them as RM 0 cost. Fill the
            blank cost cells below to fix.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-red-500" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {/* Extra cost inline edit */}
      <div className="rounded-xl border border-black/10 bg-white/60 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="font-semibold text-sm">Extra cost (order-level)</h4>
            <p className="text-xs text-slate-500 mt-1">
              Rush material, upgraded packaging, etc. Set to 0 if none.
            </p>
          </div>
          {!editingExtra ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setEditingExtra(true);
              }}
              disabled={pending}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          ) : null}
        </div>

        {editingExtra ? (
          <div className="mt-3 grid gap-3 md:grid-cols-[140px,1fr,auto]">
            <div className="space-y-1">
              <Label className="text-xs">Amount (MYR)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={extraCost}
                onChange={(e) => setExtraCost(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note (optional)</Label>
              <Input
                type="text"
                maxLength={255}
                value={extraCostNote}
                onChange={(e) => setExtraCostNote(e.target.value)}
                className="h-9"
                placeholder="e.g. Rush material surcharge"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  const nextExtra = extraCost.trim() === "" ? "0.00" : extraCost;
                  startTransition(async () => {
                    const result = await updateOrderExtraCost(
                      orderId,
                      nextExtra,
                      extraCostNote,
                    );
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setExtraCost(nextExtra);
                    applySummary(result.summary);
                    setEditingExtra(false);
                  });
                }}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setExtraCost(initialExtraCost);
                  setExtraCostNote(initialExtraCostNote ?? "");
                  setEditingExtra(false);
                  setError(null);
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Per-line cost editors */}
      <div className="rounded-xl border border-black/10 bg-white/60 p-4 md:p-5">
        <h4 className="font-semibold text-sm mb-3">Line items — unit cost</h4>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            No line items (manual order — use extra cost instead).
          </p>
        ) : (
          <ul className="divide-y divide-black/10">
            {items.map((it) => {
              const isEditing = editingItemId === it.id;
              const lineCost =
                it.unitCost != null
                  ? parseFloat(it.unitCost) * it.quantity
                  : null;
              return (
                <li
                  key={it.id}
                  className="grid grid-cols-[1fr,auto] items-center gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {it.productName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Size {it.size} · Qty {it.quantity} ·{" "}
                      {formatMYR(it.unitPrice)} each
                    </p>
                  </div>

                  {isEditing ? (
                    <InlineUnitCostEditor
                      orderId={orderId}
                      itemId={it.id}
                      initial={it.unitCost ?? ""}
                      disabled={pending}
                      onCancel={() => {
                        setEditingItemId(null);
                        setError(null);
                      }}
                      onSaved={(newCost, summary) => {
                        setItems((prev) =>
                          prev.map((row) =>
                            row.id === it.id
                              ? { ...row, unitCost: newCost }
                              : row,
                          ),
                        );
                        applySummary(summary);
                        setEditingItemId(null);
                      }}
                      onError={(msg) => setError(msg)}
                      startTransition={startTransition}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm tabular-nums ${
                          it.unitCost == null
                            ? "text-amber-700"
                            : "text-slate-700"
                        }`}
                      >
                        {it.unitCost == null
                          ? "— missing —"
                          : `${formatMYR(it.unitCost)}${
                              lineCost != null
                                ? ` × ${it.quantity} = ${formatMYR(lineCost)}`
                                : ""
                            }`}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setError(null);
                          setEditingItemId(it.id);
                        }}
                        disabled={pending}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function InlineUnitCostEditor({
  orderId,
  itemId,
  initial,
  disabled,
  onCancel,
  onSaved,
  onError,
  startTransition,
}: {
  orderId: string;
  itemId: string;
  initial: string;
  disabled: boolean;
  onCancel: () => void;
  onSaved: (newCost: string | null, summary: OrderProfitSummary) => void;
  onError: (msg: string) => void;
  startTransition: (fn: () => void) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <div className="flex items-end gap-2">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0.00"
        className="h-9 w-28"
        autoFocus
      />
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => {
          startTransition(async () => {
            const raw = value.trim() === "" ? null : value.trim();
            const result = await updateOrderItemCost(orderId, itemId, raw);
            if (!result.ok) {
              onError(result.error);
              return;
            }
            const stored =
              raw == null ? null : parseFloat(raw).toFixed(2);
            onSaved(stored, result.summary);
          });
        }}
      >
        <Save className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCancel}
        disabled={disabled}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
