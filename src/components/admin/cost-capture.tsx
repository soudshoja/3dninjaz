"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ListChecks, Package } from "lucide-react";
import { updateProductCost } from "@/actions/product-costs";
import { Button } from "@/components/ui/button";
import {
  computeMargin,
  formatPct,
  formatRm,
  parseMoney,
  tierPreview,
} from "@/lib/product-cost-math";
import type { ProductCostRow } from "@/lib/product-cost-types";

/**
 * Phone-first cost capture: one product at a time with its photo, sell price
 * and a big decimal input. "Save and next" stores the cost and moves on,
 * "Skip" leaves it for later. Resumes at the first product without a cost.
 */
export function CostCapture({ rows }: { rows: ProductCostRow[] }) {
  // Walk the catalogue category by category so similar items sit together.
  const ordered = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const c = (a.categoryName ?? "~").localeCompare(b.categoryName ?? "~");
        return c !== 0 ? c : a.name.localeCompare(b.name);
      }),
    [rows],
  );

  const [saved, setSaved] = useState<Record<string, { cost: number | null; extra: number | null }>>(
    {},
  );
  const costOf = (r: ProductCostRow) => (saved[r.id] ? saved[r.id].cost : r.cost);
  const extraOf = (r: ProductCostRow) => (saved[r.id] ? saved[r.id].extra : r.costPerExtra);

  const firstMissing = ordered.findIndex((r) => r.cost === null);
  const [index, setIndex] = useState(firstMissing === -1 ? 0 : firstMissing);
  const [done, setDone] = useState(firstMissing === -1 && ordered.length > 0);
  const [costText, setCostText] = useState("");
  const [extraText, setExtraText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const total = ordered.length;
  const doneCount = ordered.filter((r) => costOf(r) !== null).length;
  const current = ordered[index];

  // Load the field values whenever the visible product changes.
  useEffect(() => {
    if (!current) return;
    const c = costOf(current);
    const x = extraOf(current);
    setCostText(c === null ? "" : c.toFixed(2));
    setExtraText(x === null ? "" : x.toFixed(2));
    setError(null);
    if (!done) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, done]);

  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white p-10 text-center">
        <Package className="mx-auto h-8 w-8 text-[var(--color-brand-text-muted)]" aria-hidden="true" />
        <p className="mt-2 font-medium">No products yet</p>
      </div>
    );
  }

  const costNum = costText.trim() === "" ? null : parseMoney(costText);
  const extraNum = extraText.trim() === "" ? null : parseMoney(extraText);
  const isKeychain = current?.productType === "keychain";
  const margin = current ? computeMargin(current.price, costNum) : null;
  const tooHigh = costNum !== null && current?.price != null && costNum >= current.price;

  function goNext(from: number) {
    // Prefer the next product that still has no cost, else just the next one.
    const nextMissing = ordered.findIndex((r, i) => i > from && costOf(r) === null);
    if (nextMissing !== -1) return setIndex(nextMissing);
    if (from + 1 < total) return setIndex(from + 1);
    setDone(true);
  }

  function save() {
    if (!current) return;
    if (costNum === null) {
      setError(costText.trim() === "" ? "Enter a cost, or tap Skip." : "Enter an amount like 3.50");
      return;
    }
    if (isKeychain && extraText.trim() !== "" && extraNum === null) {
      setError("Enter the extra keycap cost like 0.80");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateProductCost({
        productId: current.id,
        cost: costNum,
        ...(isKeychain ? { costPerExtra: extraNum } : {}),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved((prev) => ({
        ...prev,
        [current.id]: { cost: res.cost, extra: res.costPerExtra },
      }));
      goNext(index);
    });
  }

  if (done) {
    return (
      <div className="space-y-4 rounded-xl border border-[var(--color-brand-border)] bg-white p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Check className="h-6 w-6 text-green-700" aria-hidden="true" />
        </span>
        <h2 className="font-heading text-xl">
          {doneCount === total ? "Every product has a cost" : "You reached the end"}
        </h2>
        <p className="text-sm tabular-nums text-[var(--color-brand-text-muted)]">
          {doneCount} of {total} products have a cost.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {doneCount < total && (
            <Button
              type="button"
              onClick={() => {
                const i = ordered.findIndex((r) => costOf(r) === null);
                setIndex(i === -1 ? 0 : i);
                setDone(false);
              }}
              className="h-12 bg-[var(--color-brand-ink)] px-5 text-white hover:bg-[var(--color-brand-ink)]/90"
            >
              Go to the first product without a cost
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setIndex(0);
              setDone(false);
            }}
            className="h-12 px-5"
          >
            Review from the start
          </Button>
          <Link
            href="/admin/products"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-5 text-sm font-medium hover:bg-muted"
          >
            Back to products
          </Link>
        </div>
      </div>
    );
  }

  const rowsForTier =
    isKeychain && current.tiers ? tierPreview(current.tiers, costNum, extraNum) : [];

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm tabular-nums">
          <p className="font-medium">
            {doneCount} of {total} done
          </p>
          <p className="text-[var(--color-brand-text-muted)]">
            Product {index + 1} of {total}
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={doneCount}
          aria-label="Products with a cost"
        >
          <div
            className="h-full rounded-full bg-[var(--color-brand-green)] motion-safe:transition-[width] motion-safe:duration-200"
            style={{ width: `${Math.round((doneCount / total) * 100)}%` }}
          />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4 rounded-xl border border-[var(--color-brand-border)] bg-white p-4"
      >
        <div className="flex gap-3">
          {current.thumbUrl ? (
            <Image
              src={current.thumbUrl}
              alt=""
              width={112}
              height={112}
              className="h-28 w-28 shrink-0 rounded-lg object-cover"
              priority
            />
          ) : (
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg bg-gray-100">
              <Package className="h-8 w-8 text-gray-400" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-lg font-medium leading-snug">{current.name}</h2>
            <p className="text-xs text-[var(--color-brand-text-muted)]">
              {current.categoryName ?? "Uncategorized"} · {current.productType}
            </p>
            <p className="text-sm text-[var(--color-brand-text-muted)]">Sell price</p>
            <p className="text-xl font-semibold tabular-nums">{current.priceLabel}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="capture-cost" className="text-sm font-medium">
            {isKeychain ? "Cost of a 1-keycap keychain (RM)" : "Cost per unit (RM)"}
          </label>
          <input
            id="capture-cost"
            ref={inputRef}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            value={costText}
            onChange={(e) => {
              setCostText(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            placeholder="0.00"
            className={
              "h-16 w-full rounded-xl border bg-white px-4 text-center text-3xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/50 " +
              (error ? "border-red-500" : "border-[var(--color-brand-border)]")
            }
          />
        </div>

        {isKeychain && (
          <div className="space-y-1.5">
            <label htmlFor="capture-extra" className="text-sm font-medium">
              Cost per extra keycap (RM)
            </label>
            <input
              id="capture-extra"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={extraText}
              onChange={(e) => {
                setExtraText(e.target.value);
                setError(null);
              }}
              placeholder="0.00"
              className="h-14 w-full rounded-xl border border-[var(--color-brand-border)] bg-white px-4 text-center text-2xl tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/50"
            />
          </div>
        )}

        {/* Live margin */}
        <div className="min-h-[2.5rem] text-center text-sm tabular-nums" aria-live="polite">
          {isKeychain ? (
            rowsForTier.length > 0 ? (
              <ul className="space-y-0.5 text-left">
                {rowsForTier.slice(0, 6).map((r) => (
                  <li key={r.count} className="flex justify-between gap-3">
                    <span>
                      {r.count} {r.count === 1 ? "keycap" : "keycaps"}: {formatRm(r.price)}
                    </span>
                    <span
                      className={
                        r.cost !== null && r.cost >= r.price ? "font-medium text-red-700" : ""
                      }
                    >
                      {r.margin ? `Margin ${formatPct(r.margin.pct)}` : "-"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null
          ) : margin === null ? (
            <span className="text-[var(--color-brand-text-muted)]">
              {current.price === null
                ? "No sell price set for this product."
                : "Enter a cost to see the margin."}
            </span>
          ) : (
            <span>
              Margin <strong>{formatRm(margin.amount)}</strong>
              {margin.pct !== null ? ` (${formatPct(margin.pct)})` : ""}
            </span>
          )}
        </div>

        {tooHigh && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-amber-800" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            This cost is as high as the sell price.
          </p>
        )}
        {error && (
          <p className="text-center text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-2">
          <Button
            type="submit"
            disabled={pending}
            className="h-14 w-full gap-2 bg-[var(--color-brand-ink)] text-base text-white hover:bg-[var(--color-brand-ink)]/90"
          >
            {pending ? "Saving..." : "Save and next"}
            {!pending && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={index === 0 || pending}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="h-12 gap-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => goNext(index)}
              className="h-12"
            >
              Skip
            </Button>
          </div>
        </div>
      </form>

      <p className="text-center">
        <Link
          href="/admin/products/costs?view=list"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm underline decoration-dotted"
        >
          <ListChecks className="h-4 w-4" aria-hidden="true" />
          See all products as a list
        </Link>
      </p>
    </div>
  );
}
