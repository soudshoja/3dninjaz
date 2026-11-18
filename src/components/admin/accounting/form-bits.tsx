"use client";

// Small shared pieces for the accounting entry forms: label-above fields,
// consistent inputs, an error banner and a submit row. All tap targets are at
// least 44px; labels sit above inputs (never placeholder-as-label).

import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";

export const inputCls = "w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]";
export const selectCls = `${inputCls} bg-white`;
export const border = { borderColor: `${BRAND.ink}33` };

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function CheckField({
  id,
  name,
  label,
  hint,
  defaultChecked,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-start gap-3 min-h-[44px] py-2 text-sm font-semibold cursor-pointer"
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          disabled={disabled}
          {...(checked === undefined ? { defaultChecked } : { checked })}
          onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <span>
          {label}
          {hint ? (
            <span className="mt-0.5 block text-xs font-normal text-slate-500">{hint}</span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-xl px-3 py-2 text-sm"
      style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
    >
      {error}
    </p>
  );
}

export function WarningBanner({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      className="rounded-xl px-3 py-2 text-sm"
      style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
    >
      {children}
    </p>
  );
}

export function SubmitRow({
  pending,
  label,
  pendingLabel = "Saving...",
  onCancel,
}: {
  pending: boolean;
  label: string;
  pendingLabel?: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="submit"
        disabled={pending}
        className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
        style={{ backgroundColor: BRAND.ink }}
      >
        {pending ? pendingLabel : label}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
        style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
      >
        Cancel
      </button>
    </div>
  );
}

/** Colour-coded pill for bank-match status. */
export function MatchBadge({ value }: { value: string | undefined }) {
  const v = value ?? "unchecked";
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    matched: { bg: "#dcfce7", fg: "#166534", label: "Matched" },
    check: { bg: "#fef3c7", fg: "#92400e", label: "Needs checking" },
    not_found: { bg: "#fee2e2", fg: "#991b1b", label: "Not found" },
    unchecked: { bg: "#f1f5f9", fg: "#475569", label: "Not checked" },
  };
  const m = map[v] ?? map.unchecked;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
