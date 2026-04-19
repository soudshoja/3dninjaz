"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { ShoppingBag } from "lucide-react";

/**
 * Stub cart button — Plan 02-04 REPLACES this file's body with a Zustand-aware
 * version that shows a live item count badge and opens the cart drawer.
 *
 * For Wave 2 it is just a pill link to /bag (D-02 vocabulary) so the nav
 * has a working anchor before the cart store exists.
 */
export function CartButton() {
  return (
    <Link
      href="/bag"
      aria-label="Open bag"
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-sm text-white shadow-md hover:opacity-90 transition min-h-[48px]"
      style={{ backgroundColor: BRAND.ink }}
    >
      <ShoppingBag className="h-5 w-5" aria-hidden />
      <span>Bag</span>
    </Link>
  );
}
