"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { useCartStore, type CartItem } from "@/stores/cart-store";

/**
 * Single cart line — shared by the drawer (variant="compact") and the
 * /bag full page (variant="full"). Shows thumbnail + name + size + unit
 * price + qty controls + remove + line subtotal.
 *
 * All tap targets are 48px min (D2-04). aria-live="polite" on the
 * quantity value announces live changes to screen readers.
 */
export function CartLineRow({
  item,
  variant = "compact",
}: {
  item: CartItem;
  variant?: "compact" | "full";
}) {
  const increment = useCartStore((s) => s.incrementItem);
  const decrement = useCartStore((s) => s.decrementItem);
  const remove = useCartStore((s) => s.removeItem);

  const unit = parseFloat(item.unitPrice);
  const line = Number.isFinite(unit) ? unit * item.quantity : 0;

  const thumbSize = variant === "full" ? 96 : 72;

  return (
    <article
      className={`flex gap-4 ${
        variant === "full" ? "p-4 rounded-2xl bg-white" : "py-4"
      }`}
    >
      <Link
        href={`/products/${item.productSlug}`}
        className="shrink-0"
        aria-label={`View ${item.name}`}
      >
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            height: thumbSize,
            width: thumbSize,
            backgroundColor: `${BRAND.blue}15`,
          }}
        >
          {item.image ? (
            <Image
              src={item.image}
              alt={item.name}
              fill
              sizes={`${thumbSize}px`}
              className="object-cover"
            />
          ) : null}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <Link
          href={`/products/${item.productSlug}`}
          className="block truncate font-bold"
        >
          {item.name}
        </Link>
        <p className="text-sm text-slate-600 mt-0.5">
          Size {item.size} · {formatMYR(item.unitPrice)} each
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="inline-flex items-center rounded-full border-2 overflow-hidden bg-white"
            style={{ borderColor: BRAND.ink }}
          >
            <button
              type="button"
              onClick={() => decrement(item.key)}
              aria-label={`Decrease quantity of ${item.name} size ${item.size}`}
              className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center text-zinc-900 hover:bg-zinc-100"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span
              className="min-w-[2ch] text-center font-bold px-2 text-zinc-900"
              aria-live="polite"
            >
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => increment(item.key)}
              aria-label={`Increase quantity of ${item.name} size ${item.size}`}
              disabled={item.quantity >= 10}
              className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center text-zinc-900 hover:bg-zinc-100 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={() => remove(item.key)}
            aria-label={`Remove ${item.name} size ${item.size} from bag`}
            className="min-h-[48px] px-3 inline-flex items-center gap-1 text-sm font-semibold hover:underline text-zinc-900"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            <span className={variant === "full" ? "" : "hidden sm:inline"}>
              Remove
            </span>
          </button>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold text-lg">{formatMYR(line)}</p>
      </div>
    </article>
  );
}
