"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BRAND } from "@/lib/brand";

/**
 * Filter-chip strip for /admin/orders. Reads ?status= from the URL, renders
 * each chip as a <Link> that sets (or clears) the query param. Horizontally
 * scrollable on mobile so narrow screens never blow out the container
 * (D3-20: no page-level horizontal scroll allowed).
 *
 * Phase 20 (20-10): Added awaiting_customer + awaiting_payment_review chips.
 * The awaiting_payment_review chip renders an amber count badge when
 * pendingProofCount > 0, and uses amber styling instead of the default ink
 * treatment.
 */

type FilterValue =
  | "all"
  | "pending"
  | "awaiting_customer"
  | "awaiting_payment_review"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all",                      label: "All" },
  { value: "pending",                  label: "Pending" },
  { value: "awaiting_customer",        label: "Awaiting customer" },
  { value: "awaiting_payment_review",  label: "Awaiting payment review" },
  { value: "paid",                     label: "Paid" },
  { value: "processing",               label: "Processing" },
  { value: "shipped",                  label: "Shipped" },
  { value: "delivered",                label: "Delivered" },
  { value: "cancelled",                label: "Cancelled" },
];

export function AdminOrderFilter({
  pendingProofCount = 0,
}: {
  /** Count of orders in awaiting_payment_review status — drives amber badge. */
  pendingProofCount?: number;
}) {
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
        const isPaymentReview = f.value === "awaiting_payment_review";

        // Amber treatment for the awaiting_payment_review chip (UI-SPEC §Surface 4)
        let chipStyle: React.CSSProperties;
        if (isPaymentReview) {
          chipStyle = selected
            ? { backgroundColor: "#f59e0b", borderColor: "#f59e0b", color: "#ffffff" }
            : { backgroundColor: "#fffbeb", borderColor: "#fcd34d", color: "#b45309" };
        } else {
          chipStyle = {
            borderColor: selected ? BRAND.ink : `${BRAND.ink}33`,
            backgroundColor: selected ? BRAND.ink : "transparent",
            color: selected ? "#ffffff" : BRAND.ink,
          };
        }

        return (
          <Link
            key={f.value}
            href={href}
            aria-current={selected ? "page" : undefined}
            className="inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap min-h-[40px]"
            style={chipStyle}
          >
            {f.label}
            {isPaymentReview && pendingProofCount > 0 && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold"
                aria-label={`${pendingProofCount} awaiting review`}
              >
                {pendingProofCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
