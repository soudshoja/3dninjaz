"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Package } from "lucide-react";
import { saveCaptureCosts } from "@/actions/product-costs";
import { Button } from "@/components/ui/button";
import {
  computeMargin,
  formatPct,
  formatRm,
  optionKey,
  parseMoney,
  tierPreview,
} from "@/lib/product-cost-math";
import type { OptionCostRow, ProductCostRow } from "@/lib/product-cost-types";

type Saved = {
  cost: number | null;
  extra: number | null;
  /** Option key -> saved cost (null = blank, the product cost applies). */
  options: Record<string, number | null>;
};

/** Height the on-screen keyboard takes, so the pinned action bar stays above it. */
function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setOffset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return offset;
}

const text = (n: number | null) => (n === null ? "" : n.toFixed(2));

/**
 * Phone-first cost capture: one product per screen. The product cost and the
 * cost of each of its options sit on the same card, and Back / Skip / Save and
 * next are pinned above the keyboard so the thumb never leaves the bottom. A
 * blank option cost means the product cost is used. Resumes at the first
 * product that is not yet covered.
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

  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const costOf = (r: ProductCostRow) => (saved[r.id] ? saved[r.id].cost : r.cost);
  const extraOf = (r: ProductCostRow) => (saved[r.id] ? saved[r.id].extra : r.costPerExtra);
  const optionCostOf = (r: ProductCostRow, o: OptionCostRow) =>
    saved[r.id] && o.key in saved[r.id].options ? saved[r.id].options[o.key] : o.cost;
  /** Covered = its own cost, or every option has one. */
  const covered = (r: ProductCostRow) =>
    costOf(r) !== null ||
    (r.options.length > 0 && r.options.every((o) => optionCostOf(r, o) !== null));

  const firstMissing = ordered.findIndex((r) => !covered(r));
  const [index, setIndex] = useState(firstMissing === -1 ? 0 : firstMissing);
  const [done, setDone] = useState(firstMissing === -1 && ordered.length > 0);
  const [costText, setCostText] = useState("");
  const [extraText, setExtraText] = useState("");
  const [optTexts, setOptTexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const keyboard = useKeyboardOffset();

  const total = ordered.length;
  const doneCount = ordered.filter(covered).length;
  const current = ordered[index];

  // Load the field values whenever the visible product changes.
  useEffect(() => {
    if (!current) return;
    setCostText(text(costOf(current)));
    setExtraText(text(extraOf(current)));
    setOptTexts(Object.fromEntries(current.options.map((o) => [o.key, text(optionCostOf(current, o))])));
    setError(null);
    if (!done) formRef.current?.querySelector<HTMLInputElement>("input[data-capture]")?.focus();
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
    const nextMissing = ordered.findIndex((r, i) => i > from && !covered(r));
    if (nextMissing !== -1) return setIndex(nextMissing);
    if (from + 1 < total) return setIndex(from + 1);
    setDone(true);
  }

  function save() {
    if (!current) return;
    if (costText.trim() !== "" && costNum === null) {
      setError("Enter the product cost like 3.50");
      return;
    }
    if (isKeychain && extraText.trim() !== "" && extraNum === null) {
      setError("Enter the extra keycap cost like 0.80");
      return;
    }
    const optionPayload: Array<{ fieldId: string; value: string; cost: number | null }> = [];
    for (const o of current.options) {
      const t = (optTexts[o.key] ?? "").trim();
      const n = t === "" ? null : parseMoney(t);
      if (t !== "" && n === null) {
        setError(`Enter the cost of "${o.label}" like 3.50`);
        return;
      }
      optionPayload.push({ fieldId: o.fieldId, value: o.value, cost: n });
    }
    if (costNum === null && optionPayload.every((o) => o.cost === null)) {
      setError("Enter a cost, or tap Skip.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveCaptureCosts({
        productId: current.id,
        cost: costNum,
        ...(isKeychain ? { costPerExtra: extraNum } : {}),
        options: optionPayload,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved((prev) => ({
        ...prev,
        [current.id]: {
          cost: res.cost,
          extra: res.costPerExtra,
          options: Object.fromEntries(
            res.options.map((o) => [optionKey(current.id, o.fieldId, o.value), o.cost]),
          ),
        },
      }));
      goNext(index);
    });
  }

  /** Enter moves to the next box, and saves from the last one. */
  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>("input[data-capture]") ?? [],
    );
    const i = all.indexOf(e.currentTarget);
    if (i >= 0 && i < all.length - 1) all[i + 1].focus();
    else save();
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
        <p className="text-base tabular-nums text-[var(--color-brand-text-muted)]">
          {doneCount} of {total} products have a cost.
        </p>
        <div className="flex flex-col gap-2">
          {doneCount < total && (
            <Button
              type="button"
              onClick={() => {
                const i = ordered.findIndex((r) => !covered(r));
                setIndex(i === -1 ? 0 : i);
                setDone(false);
              }}
              className="h-12 bg-[var(--color-brand-ink)] px-5 text-base text-white hover:bg-[var(--color-brand-ink)]/90"
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
            className="h-12 px-5 text-base"
          >
            Review from the start
          </Button>
          <Link
            href="/admin/products/costs?view=list"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-5 text-base font-medium hover:bg-muted"
          >
            See all products
          </Link>
        </div>
      </div>
    );
  }

  const rowsForTier =
    isKeychain && current.tiers ? tierPreview(current.tiers, costNum, extraNum) : [];
  const multiField = new Set(current.options.map((o) => o.fieldId)).size > 1;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="mx-auto max-w-md space-y-3 pb-28">
      {/* Progress + jump */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-medium tabular-nums">
            {doneCount} of {total} done
          </p>
          {/* Looks like a chip, opens the native picker */}
          <label className="relative inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--color-brand-border)] bg-white pl-4 pr-3 text-base tabular-nums">
            <span aria-hidden="true">
              Product {index + 1} of {total}
            </span>
            <ChevronDown className="h-4 w-4 text-[var(--color-brand-text-muted)]" aria-hidden="true" />
            <select
              aria-label={`Product ${index + 1} of ${total}. Go to another product`}
              value={current.id}
              disabled={pending}
              onChange={(e) => {
                const i = ordered.findIndex((r) => r.id === e.target.value);
                if (i >= 0) setIndex(i);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {ordered.map((r) => (
                <option key={r.id} value={r.id}>
                  {covered(r) ? "Done: " : ""}
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={doneCount}
          aria-label="Products with a cost"
        >
          <div
            className="h-full rounded-full bg-[var(--color-brand-green)] motion-safe:transition-[width] motion-safe:duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="space-y-5 rounded-xl border border-[var(--color-brand-border)] bg-white p-4">
          <div className="flex items-center gap-3">
            {current.thumbUrl ? (
              <Image
                src={current.thumbUrl}
                alt=""
                width={72}
                height={72}
                className="h-[72px] w-[72px] shrink-0 rounded-lg object-cover"
                priority
              />
            ) : (
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <Package className="h-7 w-7 text-gray-400" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="break-words text-lg font-semibold leading-snug">{current.name}</h2>
              <p className="text-sm text-[var(--color-brand-text-muted)]">
                {current.categoryName ?? "Uncategorized"} · {current.productType}
              </p>
              <p className="text-base font-semibold tabular-nums">
                {current.price === null ? "No price set" : `Sells for ${current.priceLabel}`}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="capture-cost" className="text-base font-medium">
              {isKeychain ? "Cost of a 1-keycap keychain" : "Cost of the product"}
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-[var(--color-brand-text-muted)]"
                aria-hidden="true"
              >
                RM
              </span>
              <input
                id="capture-cost"
                data-capture
                type="text"
                inputMode="decimal"
                enterKeyHint={current.options.length > 0 || isKeychain ? "next" : "done"}
                autoComplete="off"
                value={costText}
                onChange={(e) => {
                  setCostText(e.target.value);
                  setError(null);
                }}
                onKeyDown={onEnter}
                aria-invalid={!!error}
                placeholder="0.00"
                className={
                  "h-16 w-full rounded-xl border bg-white pl-12 pr-4 text-right text-3xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/50 " +
                  (error ? "border-red-500" : "border-[var(--color-brand-border)]")
                }
              />
            </div>
          </div>

          {isKeychain && (
            <div className="space-y-1.5">
              <label htmlFor="capture-extra" className="text-base font-medium">
                Each extra keycap adds
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-[var(--color-brand-text-muted)]"
                  aria-hidden="true"
                >
                  RM
                </span>
                <input
                  id="capture-extra"
                  data-capture
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  value={extraText}
                  onChange={(e) => {
                    setExtraText(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={onEnter}
                  placeholder="0.00"
                  className="h-14 w-full rounded-xl border border-[var(--color-brand-border)] bg-white pl-12 pr-4 text-right text-2xl tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/50"
                />
              </div>
            </div>
          )}

          {current.options.length > 0 && (
            <fieldset className="space-y-3 border-t border-[var(--color-brand-border)] pt-4">
              <legend className="sr-only">Cost of each option</legend>
              <div>
                <p className="text-base font-medium">
                  {current.options.length} {current.options.length === 1 ? "option" : "options"}
                </p>
                <p className="text-sm text-[var(--color-brand-text-muted)]">
                  {costNum !== null
                    ? `Leave blank to use the product cost, ${formatRm(costNum)}.`
                    : "Leave blank to use the product cost."}
                </p>
              </div>
              {current.options.map((o) => {
                const id = `opt-${o.key}`;
                return (
                  <div key={o.key} className="flex items-center justify-between gap-3">
                    <label htmlFor={id} className="min-w-0 flex-1">
                      <span className="block break-words text-base leading-snug">
                        {multiField ? `${o.fieldLabel}: ${o.label}` : o.label}
                      </span>
                      <span className="block text-sm tabular-nums text-[var(--color-brand-text-muted)]">
                        {o.price !== null ? `Sells for ${formatRm(o.price)}` : "Same price as the product"}
                      </span>
                    </label>
                    <div className="relative shrink-0">
                      <span
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-brand-text-muted)]"
                        aria-hidden="true"
                      >
                        RM
                      </span>
                      <input
                        id={id}
                        data-capture
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="next"
                        autoComplete="off"
                        value={optTexts[o.key] ?? ""}
                        onChange={(e) => {
                          setOptTexts((prev) => ({ ...prev, [o.key]: e.target.value }));
                          setError(null);
                        }}
                        onKeyDown={onEnter}
                        placeholder={costNum !== null ? costNum.toFixed(2) : "0.00"}
                        className="h-12 w-32 rounded-lg border border-[var(--color-brand-border)] bg-white pl-9 pr-3 text-right text-lg tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/50"
                      />
                    </div>
                  </div>
                );
              })}
            </fieldset>
          )}

          {/* Live margin */}
          <div className="text-base tabular-nums" aria-live="polite">
            {isKeychain ? (
              rowsForTier.length > 0 ? (
                <details>
                  <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-medium">
                    Margin by keycap count
                  </summary>
                  <ul className="space-y-1 pb-1 text-sm">
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
                </details>
              ) : null
            ) : margin === null ? (
              <span className="text-sm text-[var(--color-brand-text-muted)]">
                {current.price === null
                  ? "No sell price set for this product."
                  : "Enter the product cost to see the margin."}
              </span>
            ) : (
              <span>
                Margin <strong>{formatRm(margin.amount)}</strong>
                {margin.pct !== null ? ` (${formatPct(margin.pct)})` : ""}
              </span>
            )}
          </div>

          {tooHigh && (
            <p className="flex items-center gap-1.5 text-sm text-amber-800" role="status">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              This cost is as high as the sell price.
            </p>
          )}
          {error && (
            <p className="text-base text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Pinned above the keyboard and the home indicator */}
        <div
          className="fixed inset-x-0 z-40 border-t border-[var(--color-brand-border)] bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:left-64"
          style={{ bottom: keyboard }}
        >
          <div className="mx-auto grid max-w-md grid-cols-[auto_auto_1fr] gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={index === 0 || pending}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              aria-label="Back to the previous product"
              className="h-14 gap-1.5 px-4 text-base"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => goNext(index)}
              className="h-14 px-4 text-base"
            >
              Skip
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-14 gap-2 bg-[var(--color-brand-ink)] text-base text-white hover:bg-[var(--color-brand-ink)]/90"
            >
              {pending ? "Saving..." : "Save and next"}
              {!pending && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
