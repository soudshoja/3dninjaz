// STUB — Plan 02-04 replaces the onClick handler to write into the Zustand
// cart store and open the cart drawer. Props contract is preserved.
"use client";

import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

type SelectedVariant = {
  id: string;
  size: "S" | "M" | "L";
  price: string;
} | null;

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
  const disabled = selectedVariant === null;
  const label = disabled
    ? "Pick a size"
    : `Add to bag · ${formatMYR(selectedVariant!.price)}`;

  const onClick = () => {
    if (!selectedVariant) return;
    // Plan 02-04 replaces this with useCartStore().addItem({...}) + drawer.open().
    // eslint-disable-next-line no-console
    console.log("[add-to-bag stub]", {
      productId,
      productSlug,
      productName,
      productImage,
      variantId: selectedVariant.id,
      size: selectedVariant.size,
      unitPrice: selectedVariant.price,
    });
  };

  return (
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
  );
}
