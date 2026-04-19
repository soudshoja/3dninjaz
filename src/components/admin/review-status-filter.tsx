"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BRAND } from "@/lib/brand";

type Filter = "pending" | "approved" | "hidden" | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All" },
];

export function ReviewStatusFilter({ current }: { current: Filter }) {
  const path = usePathname();
  const sp = useSearchParams();

  const hrefFor = (value: Filter) => {
    const next = new URLSearchParams(sp);
    if (value === "pending") next.delete("status");
    else next.set("status", value);
    const qs = next.toString();
    return qs ? `${path}?${qs}` : path;
  };

  return (
    <nav
      aria-label="Filter reviews by status"
      className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
    >
      {FILTERS.map((f) => {
        const active = current === f.value;
        return (
          <Link
            key={f.value}
            href={hrefFor(f.value)}
            aria-current={active ? "page" : undefined}
            className="inline-flex items-center rounded-full border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap min-h-[40px]"
            style={{
              borderColor: active ? BRAND.ink : `${BRAND.ink}33`,
              backgroundColor: active ? BRAND.ink : "transparent",
              color: active ? "#ffffff" : BRAND.ink,
            }}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}
