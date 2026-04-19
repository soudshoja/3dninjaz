"use client";

import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useCartStore } from "@/stores/cart-store";

/**
 * Nav bag button — shows a live item count badge and opens the CartDrawer
 * when clicked. D-02 vocabulary: label is "Bag", drawer title is "Your bag".
 *
 * Hydration guard: Zustand persist rehydrates on the client, so the first
 * SSR render has count=0 but the first client render would show the real
 * count, causing a hydration mismatch warning. Mount guard forces count=0
 * until after hydration, matching SSR output.
 */
export function CartButton() {
  const setOpen = useCartStore((s) => s.setDrawerOpen);
  const count = useCartStore((s) => s.getItemCount());

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const shownCount = mounted ? count : 0;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={
        shownCount > 0
          ? `Open bag, ${shownCount} ${shownCount === 1 ? "item" : "items"}`
          : "Open bag"
      }
      className="relative inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-sm text-white shadow-md hover:opacity-90 transition min-h-[48px]"
      style={{ backgroundColor: BRAND.ink }}
    >
      <ShoppingBag className="h-5 w-5" aria-hidden />
      <span>Bag</span>
      {shownCount > 0 ? (
        <span
          className="absolute -top-1 -right-1 min-w-[22px] h-[22px] rounded-full px-1.5 text-xs font-bold inline-flex items-center justify-center"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          aria-hidden
        >
          {shownCount}
        </span>
      ) : null}
    </button>
  );
}
