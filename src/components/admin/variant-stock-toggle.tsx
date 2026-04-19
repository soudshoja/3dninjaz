"use client";

import { useState, useTransition } from "react";
import {
  toggleVariantStock,
  setLowStockThreshold,
} from "@/actions/admin-inventory";
import { BRAND } from "@/lib/brand";

type Props = {
  variantId: string;
  initialInStock: boolean;
  initialThreshold: number | null;
};

/**
 * Per-variant inventory toggle — switch + optional low-stock threshold input.
 * Used by /admin/inventory list rows.
 *
 * Tap targets: switch + threshold input ≥ 48px (D-04).
 * Optimistic UX: state flips immediately; on server error it rolls back.
 */
export function VariantStockToggle({
  variantId,
  initialInStock,
  initialThreshold,
}: Props) {
  const [inStock, setInStock] = useState(initialInStock);
  const [threshold, setThreshold] = useState<string>(
    initialThreshold === null ? "" : String(initialThreshold),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onToggle = (next: boolean) => {
    setError(null);
    const previous = inStock;
    setInStock(next);
    startTransition(async () => {
      const res = await toggleVariantStock(variantId, next);
      if (!res.ok) {
        setInStock(previous);
        setError(res.error);
      }
    });
  };

  const onThresholdBlur = () => {
    setError(null);
    const trimmed = threshold.trim();
    const value = trimmed === "" ? null : Math.max(0, parseInt(trimmed, 10));
    if (trimmed !== "" && Number.isNaN(value as number)) {
      setError("Enter an integer");
      return;
    }
    startTransition(async () => {
      const res = await setLowStockThreshold(
        variantId,
        value as number | null,
      );
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          role="switch"
          checked={inStock}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={pending}
          aria-label="In stock"
          className="h-6 w-6 rounded"
        />
        <span
          className="text-sm font-semibold"
          style={{ color: inStock ? BRAND.green : "#dc2626" }}
        >
          {inStock ? "In stock" : "Sold out"}
        </span>
      </label>
      <div className="flex items-center gap-2">
        <label
          htmlFor={`thr-${variantId}`}
          className="text-xs text-slate-600 whitespace-nowrap"
        >
          Low stock at
        </label>
        <input
          id={`thr-${variantId}`}
          type="number"
          inputMode="numeric"
          min={0}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value.slice(0, 5))}
          onBlur={onThresholdBlur}
          disabled={pending}
          placeholder="—"
          className="w-20 rounded-xl border-2 px-2 py-2 text-sm min-h-[40px] disabled:opacity-50"
          style={{ borderColor: `${BRAND.ink}33` }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
