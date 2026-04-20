"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { useCartStore } from "@/stores/cart-store";

type SelectedVariant = {
  id: string;
  size: "S" | "M" | "L";
  price: string;
} | null;

/**
 * Wired Add-to-bag button. Writes the selected variant into the Zustand
 * cart store and opens the CartDrawer so the user gets immediate feedback.
 *
 * Props contract is frozen from the Plan 02-03 stub so the PDP never had
 * to change — only the onClick body gained real behavior.
 */
export function AddToBagButton({
  selectedVariant,
  productId,
  productSlug,
  productName,
  productImage,
}: {
  selectedVariant: SelectedVariant;
  productId: string;
  productSlug: string;
  productName: string;
  productImage: string | null;
}) {
  const addItem = useCartStore((s) => s.addItem);
  const setOpen = useCartStore((s) => s.setDrawerOpen);
  const disabled = selectedVariant === null;
  // Brief "Added!" confirmation flash — 2026-04-20 ninja pass. The cart
  // drawer also opens (existing behavior), so this is a low-noise reinforcer.
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  const label = disabled
    ? "Pick a size"
    : `Add to bag · ${formatMYR(selectedVariant!.price)}`;

  const onClick = () => {
    if (!selectedVariant) return;
    addItem({
      productId,
      productSlug,
      name: productName,
      image: productImage,
      size: selectedVariant.size,
      variantId: selectedVariant.id,
      unitPrice: selectedVariant.price,
    });
    setFlash(true);
    setOpen(true);
    // Plan 05-02 — fire-and-forget add_to_bag analytics ping (Q-05-03).
    // Server hashes the IP + rate-limits; we ignore network errors.
    if (typeof window !== "undefined") {
      try {
        void fetch("/api/events/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "add_to_bag",
            path: window.location.pathname,
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* noop — analytics failure must never break add-to-bag */
      }
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="mt-6 w-full rounded-full py-4 px-6 font-bold text-lg text-white shadow-[0_6px_0_rgba(0,0,0,0.35)] hover:translate-y-[2px] hover:shadow-[0_4px_0_rgba(0,0,0,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition min-h-[60px]"
        style={{ backgroundColor: disabled ? "#6b7280" : BRAND.ink }}
      >
        {label}
      </button>
      {flash ? (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-2 flex items-center gap-2 rounded-full px-4 py-2 font-bold text-sm shadow-md animate-fade-in-out"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          role="status"
          aria-live="polite"
        >
          <Image
            src="/icons/ninja/emoji/great@128.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span>Added to bag!</span>
        </div>
      ) : null}
    </div>
  );
}
