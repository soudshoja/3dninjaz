"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  isValidYmd,
  type RangePreset,
} from "@/lib/date-range";

type Props = {
  /** Resolved range from the server (see resolveRange). */
  current: { preset: RangePreset | "custom"; from: string | null; to: string | null };
  /** Subset/order of preset chips. Defaults to all presets. */
  presets?: readonly RangePreset[];
  /** Optional path to navigate on; defaults to the current pathname. */
  basePath?: string;
};

/**
 * Shared date-range picker for /admin and every /admin/accounting/* page.
 * Preset chips set ?range=<preset>; "Custom" opens a small panel that sets
 * ?from=&to= (and clears ?range). Other query params are preserved.
 * All days are Malaysia time.
 */
export function DateRangePicker({ current, presets = RANGE_PRESETS, basePath }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const path = basePath ?? pathname;
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(current.from ?? "");
  const [to, setTo] = useState(current.to ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const fromId = useId();
  const toId = useId();

  // Keep the inputs in step when the URL changes underneath us.
  useEffect(() => {
    setFrom(current.from ?? "");
    setTo(current.to ?? "");
  }, [current.from, current.to]);

  useEffect(() => {
    if (!open) return;
    fromRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const push = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(sp.toString());
    mutate(next);
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${path}?${qs}` : path);
    });
  };

  const choosePreset = (p: RangePreset) => {
    setOpen(false);
    push((n) => {
      n.set("range", p);
      n.delete("from");
      n.delete("to");
    });
  };

  const canApply = isValidYmd(from) && isValidYmd(to);
  const applyCustom = () => {
    if (!canApply) return;
    setOpen(false);
    push((n) => {
      n.delete("range");
      n.set("from", from);
      n.set("to", to);
    });
  };

  const isCustom = current.preset === "custom";

  const chipClass =
    "inline-flex items-center justify-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold min-h-[44px] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60";
  const chipStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? BRAND.ink : "#ffffff",
    color: active ? "#ffffff" : BRAND.ink,
    borderColor: active ? BRAND.ink : `${BRAND.ink}22`,
    outlineColor: BRAND.blue,
  });

  return (
    <div ref={wrapRef} className="relative">
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={current.preset === p}
            disabled={pending}
            onClick={() => choosePreset(p)}
            className={chipClass}
            style={chipStyle(current.preset === p)}
          >
            {RANGE_PRESET_LABELS[p]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={isCustom}
          aria-expanded={open}
          aria-controls={panelId}
          disabled={pending}
          onClick={() => setOpen((o) => !o)}
          className={chipClass}
          style={chipStyle(isCustom)}
        >
          <CalendarRange className="size-4" aria-hidden="true" />
          Custom
        </button>
      </div>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Custom date range"
          className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-2 bg-white p-4 shadow-lg"
          style={{ borderColor: `${BRAND.ink}22` }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={fromId} className="mb-1 block text-xs font-semibold">
                From
              </label>
              <input
                ref={fromRef}
                id={fromId}
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-xl border-2 px-3 text-sm min-h-[44px]"
                style={{ borderColor: `${BRAND.ink}33` }}
              />
            </div>
            <div>
              <label htmlFor={toId} className="mb-1 block text-xs font-semibold">
                To
              </label>
              <input
                id={toId}
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-xl border-2 px-3 text-sm min-h-[44px]"
                style={{ borderColor: `${BRAND.ink}33` }}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Dates are Malaysia time, both days included.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
              style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!canApply}
              className="rounded-full px-5 text-sm font-semibold text-white min-h-[44px] disabled:opacity-50"
              style={{ backgroundColor: BRAND.ink }}
            >
              Apply range
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
