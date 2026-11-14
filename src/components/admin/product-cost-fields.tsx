"use client";

import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  computeMargin,
  formatPct,
  formatRm,
  parseMoney,
  tierPreview,
} from "@/lib/product-cost-math";

/**
 * Accounting v2 - "Cost" card on the admin product form (add + edit).
 * Stocked / simple / configurable / vending: one "Cost per unit (RM)" with a
 * live margin against the sell price. Keychains: cost of a 1-keycap keychain,
 * cost per extra keycap, and a per-tier preview (price, cost, margin).
 * The cost is admin-only and never reaches the storefront.
 */
export function ProductCostFields({
  productType,
  cost,
  costPerExtra,
  onCostChange,
  onCostPerExtraChange,
  price,
  tiers,
  errors,
}: {
  productType: string;
  cost: string;
  costPerExtra: string;
  onCostChange: (v: string) => void;
  onCostPerExtraChange: (v: string) => void;
  /** Reference sell price (lowest variant / flat price / 1-keycap price). */
  price: number | null;
  /** Keychain price tiers by keycap count. */
  tiers: Record<string, number> | null;
  errors?: { cost?: string; costPerExtra?: string };
}) {
  const isKeychain = productType === "keychain";
  const costNum = cost.trim() === "" ? null : parseMoney(cost);
  const extraNum = costPerExtra.trim() === "" ? null : parseMoney(costPerExtra);
  const margin = computeMargin(price, costNum);
  const costTooHigh = costNum !== null && price !== null && costNum >= price;
  const rows = isKeychain && tiers ? tierPreview(tiers, costNum, extraNum) : [];

  return (
    <Card id="field-cost">
      <CardHeader>
        <CardTitle>Cost</CardTitle>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          What it costs you to make one. Used for margin reports only. Customers
          never see it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="costPrice"
              className={errors?.cost ? "text-red-600" : ""}
            >
              {isKeychain ? "Cost of a 1-keycap keychain (RM)" : "Cost per unit (RM)"}
            </Label>
            <Input
              id="costPrice"
              type="text"
              inputMode="decimal"
              value={cost}
              onChange={(e) => onCostChange(e.target.value)}
              placeholder="e.g. 3.50"
              aria-invalid={!!errors?.cost}
              className="h-11 tabular-nums md:h-10"
            />
            {errors?.cost && (
              <p className="text-sm text-red-600" role="alert">
                {errors.cost}
              </p>
            )}
          </div>

          {isKeychain && (
            <div className="space-y-2">
              <Label
                htmlFor="costPerExtraUnit"
                className={errors?.costPerExtra ? "text-red-600" : ""}
              >
                Cost per extra keycap (RM)
              </Label>
              <Input
                id="costPerExtraUnit"
                type="text"
                inputMode="decimal"
                value={costPerExtra}
                onChange={(e) => onCostPerExtraChange(e.target.value)}
                placeholder="e.g. 0.80"
                aria-invalid={!!errors?.costPerExtra}
                className="h-11 tabular-nums md:h-10"
              />
              {errors?.costPerExtra && (
                <p className="text-sm text-red-600" role="alert">
                  {errors.costPerExtra}
                </p>
              )}
            </div>
          )}
        </div>

        {!isKeychain && (
          <p className="text-sm tabular-nums" aria-live="polite">
            {price === null ? (
              <span className="text-[var(--color-brand-text-muted)]">
                Set a price to see the margin.
              </span>
            ) : costNum === null ? (
              <span className="text-[var(--color-brand-text-muted)]">
                Sell price {formatRm(price)}. Enter a cost to see the margin.
              </span>
            ) : (
              <span>
                Sell price {formatRm(price)}. Margin{" "}
                <strong>{formatRm(margin?.amount)}</strong>
                {margin?.pct !== null && margin?.pct !== undefined
                  ? ` (${formatPct(margin.pct)})`
                  : ""}
                .
              </span>
            )}
          </p>
        )}

        {costTooHigh && (
          <p className="flex items-center gap-1.5 text-sm text-amber-800" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            The cost is as high as the sell price, so this product makes no profit.
          </p>
        )}

        {isKeychain && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Margin by keycap count</p>
            {rows.length === 0 ? (
              <p className="text-sm text-[var(--color-brand-text-muted)]">
                Add price tiers in the configurator to preview margins here.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-[var(--color-brand-border)]">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-[var(--color-brand-text-muted)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Keycaps</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.map((r) => {
                      const bad = r.cost !== null && r.cost >= r.price;
                      return (
                        <tr
                          key={r.count}
                          className="border-t border-[var(--color-brand-border)]"
                        >
                          <td className="px-3 py-2">{r.count}</td>
                          <td className="px-3 py-2 text-right">{formatRm(r.price)}</td>
                          <td className="px-3 py-2 text-right">
                            {r.cost === null ? "-" : formatRm(r.cost)}
                          </td>
                          <td
                            className={
                              "px-3 py-2 text-right " +
                              (bad ? "font-medium text-red-700" : "")
                            }
                          >
                            {r.margin === null
                              ? "-"
                              : `${formatRm(r.margin.amount)}${
                                  r.margin.pct !== null ? ` (${formatPct(r.margin.pct)})` : ""
                                }`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {extraNum === null && costNum !== null && rows.length > 1 && (
              <p className="flex items-center gap-1.5 text-sm text-amber-800" role="status">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                No cost per extra keycap is set, so every keychain is costed as a
                1-keycap keychain.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
