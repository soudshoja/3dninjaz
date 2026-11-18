import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";

/** Small stat card used on the accounting overview and Net Position pages. */
export function StatCard({
  label,
  value,
  sub,
  accent,
  big,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  accent?: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 font-bold tabular-nums ${big ? "text-3xl" : "text-xl"}`}
        style={{ color: accent ?? BRAND.ink }}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-slate-500 tabular-nums">{sub}</p> : null}
    </div>
  );
}

/** Amber notice strip (warnings the admin should read, not errors). */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="mt-2 rounded-xl px-3 py-2 text-sm"
      style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
    >
      {children}
    </p>
  );
}

/** Negative = red, otherwise ink. For signed money figures. */
export function signedColor(n: number): string {
  return n < 0 ? "#dc2626" : BRAND.ink;
}
