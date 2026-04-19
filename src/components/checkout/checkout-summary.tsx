"use client";

import { CartLineRow } from "@/components/store/cart-line-row";
import type { CartItem } from "@/stores/cart-store";
import { formatMYR } from "@/lib/format";

/**
 * Order summary on /checkout. Reuses the Phase 2 CartLineRow (compact variant)
 * so the bag and checkout render each line identically. Shipping is free in
 * v1 (D3-05) so total equals subtotal.
 */
export function CheckoutSummary({
  items,
  subtotal,
}: {
  items: CartItem[];
  subtotal: number;
}) {
  return (
    <div>
      <div className="divide-y divide-black/10 max-h-[40vh] overflow-y-auto">
        {items.map((i) => (
          <CartLineRow key={i.key} item={i} variant="compact" />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-slate-600">Subtotal</span>
        <span className="font-[var(--font-heading)] text-2xl">
          {formatMYR(subtotal)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>Shipping</span>
        <span>Free</span>
      </div>
      <div className="mt-3 pt-3 border-t border-black/10 flex items-center justify-between">
        <span className="font-semibold">Total</span>
        <span className="font-[var(--font-heading)] text-2xl">
          {formatMYR(subtotal)}
        </span>
      </div>
    </div>
  );
}
