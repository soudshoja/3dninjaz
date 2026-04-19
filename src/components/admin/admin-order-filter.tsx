"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BRAND } from "@/lib/brand";

/**
 * Filter-chip strip for /admin/orders. Reads ?status= from the URL, renders
 * each chip as a <Link> that sets (or clears) the query param. Horizontally
 * scrollable on mobile so narrow screens never blow out the container
 * (D3-20: no page-level horizontal scroll allowed).
 */

type FilterValue =
  | "all"
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all",        label: "All" },
  { value: "pending",    label: "Pending" },
  { value: "paid",       label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "shipped",    label: "Shipped" },
  { value: "delivered",  label: "Delivered" },
  { value: "cancelled",  label: "Cancelled" },
];

export function AdminOrderFilter() {
  const path = usePathname();
  const params = useSearchParams();
  const raw = params.get("status") ?? "all";
  const current = (FILTERS.some((f) => f.value === raw) ? raw : "all") as FilterValue;

  return (
    <nav
      aria-label="Filter orders by status"
      className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
    >
      {FILTERS.map((f) => {
        const selected = current === f.value;
        const href = f.value === "all" ? path : `${path}?status=${f.value}`;
        return (
          <Link
            key={f.value}
            href={href}
            aria-current={selected ? "page" : undefined}
            className="inline-flex items-center rounded-full border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap min-h-[40px]"
            style={{
              borderColor: selected ? BRAND.ink : `${BRAND.ink}33`,
              backgroundColor: selected ? BRAND.ink : "transparent",
              color: selected ? "#ffffff" : BRAND.ink,
            }}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}
