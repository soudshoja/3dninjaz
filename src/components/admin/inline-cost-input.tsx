"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { updateOptionCost, updateProductCost } from "@/actions/product-costs";
import { parseMoney } from "@/lib/product-cost-math";

/**
 * Inline editable cost cell. Enter or Tab (blur) saves; a tick confirms for
 * about 1.5s. Empty input clears the cost. Used by the products table, the
 * mobile card list and the cost-capture list.
 *
 * `data-cost-input` lets the parent move focus to the next row on Enter.
 */
export function InlineCostInput({
  productId,
  value,
  onSaved,
  onEnter,
  large = false,
  label,
  option,
  placeholder = "0.00",
}: {
  productId: string;
  /** Set to edit the cost of one Select option (variant) instead of the product. */
  option?: { fieldId: string; value: string };
  /** Shown when empty, e.g. the product cost an option falls back to. */
  placeholder?: string;
  value: number | null;
  onSaved: (cost: number | null) => void;
  /** Called after Enter so the parent can focus the next row. */
  onEnter?: (el: HTMLInputElement) => void;
  /** 44px touch-friendly variant for mobile cards. */
  large?: boolean;
  /** Accessible name, e.g. "Cost for Dragon keychain". */
  label: string;
}) {
  const [text, setText] = useState(value === null ? "" : value.toFixed(2));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef<number | null>(value);
  const focused = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow server value changes (bulk edit, undo) unless the user is typing.
  useEffect(() => {
    lastSaved.current = value;
    if (!focused.current) setText(value === null ? "" : value.toFixed(2));
  }, [value]);

  useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(t);
  }, [status]);

  async function commit(): Promise<boolean> {
    const trimmed = text.trim();
    const parsed = trimmed === "" ? null : parseMoney(trimmed);
    if (trimmed !== "" && parsed === null) {
      setStatus("error");
      setError("Enter an amount like 3.50");
      return false;
    }
    if (parsed === lastSaved.current) {
      setError(null);
      if (parsed !== null) setText(parsed.toFixed(2));
      return true;
    }
    setStatus("saving");
    setError(null);
    const res = option
      ? await updateOptionCost({ productId, fieldId: option.fieldId, value: option.value, cost: parsed })
      : await updateProductCost({ productId, cost: parsed });
    if (!res.ok) {
      setStatus("error");
      setError(res.error);
      return false;
    }
    lastSaved.current = res.cost;
    setText(res.cost === null ? "" : res.cost.toFixed(2));
    setStatus("saved");
    onSaved(res.cost);
    return true;
  }

  const height = large ? "h-11" : "h-9";
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <div className="relative">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-brand-text-muted)]"
          aria-hidden="true"
        >
          RM
        </span>
        <input
          ref={inputRef}
          data-cost-input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={status === "error"}
          value={text}
          placeholder={placeholder}
          onFocus={(e) => {
            focused.current = true;
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setText(e.target.value);
            if (status === "error") {
              setStatus("idle");
              setError(null);
            }
          }}
          onBlur={() => {
            focused.current = false;
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const el = e.currentTarget;
              void commit().then((ok) => {
                if (ok && onEnter) onEnter(el);
              });
            }
          }}
          className={
            `${height} ${large ? "w-32 text-base" : "w-28 text-sm"} rounded-md border bg-white pl-8 pr-8 text-right tabular-nums ` +
            "outline-none focus-visible:border-[var(--color-brand-blue)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/40 " +
            (status === "error"
              ? "border-red-500"
              : "border-[var(--color-brand-border)]")
          }
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2" aria-hidden="true">
          {status === "saving" && (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-brand-text-muted)]" />
          )}
          {status === "saved" && <Check className="h-4 w-4 text-green-600" />}
        </span>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {status === "saved" ? "Saved" : status === "saving" ? "Saving" : ""}
      </span>
      {error && (
        <span className="text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
