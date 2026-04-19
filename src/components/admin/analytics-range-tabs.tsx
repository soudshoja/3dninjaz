"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { BRAND } from "@/lib/brand";

const TABS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
] as const;

/**
 * Range tab strip on /admin. Updates ?range=7d|30d|90d via shallow router push.
 * Tab buttons min-h-[48px] (D-04). Active tab is filled brand-ink.
 */
export function AnalyticsRangeTabs({ current }: { current: "7d" | "30d" | "90d" }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setRange = (value: string) => {
    const next = new URLSearchParams(sp);
    next.set("range", value);
    startTransition(() => {
      router.push(`${path}?${next.toString()}`);
    });
  };

  return (
    <div
      role="tablist"
      aria-label="Analytics range"
      className="inline-flex gap-2 rounded-full bg-white p-1 border-2"
      style={{ borderColor: `${BRAND.ink}22` }}
    >
      {TABS.map((t) => {
        const active = current === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={pending}
            onClick={() => setRange(t.value)}
            className="rounded-full px-5 text-sm font-bold min-h-[48px] disabled:opacity-50"
            style={{
              backgroundColor: active ? BRAND.ink : "transparent",
              color: active ? "#ffffff" : BRAND.ink,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
