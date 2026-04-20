"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { useCartStore } from "@/stores/cart-store";
import { CartLineRow } from "@/components/store/cart-line-row";
import { Shuriken } from "@/components/brand/shuriken";

/**
 * Hydration boundary — Zustand `persist` rehydrates post-mount; if we render
 * directly from the store the first paint shows an empty bag which flips to
 * the real contents after hydration (and causes a React hydration warning).
 * This wrapper defers rendering until after useEffect runs, matching the
 * SSR empty shell exactly.
 */
function HydratedBoundary({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback ?? null}</>;
  return <>{children}</>;
}

export default function BagPage() {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.getSubtotal());
  const count = useCartStore((s) => s.getItemCount());

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 md:py-14">
      <div className="flex items-center gap-3 mb-2">
        <Shuriken className="w-7 h-7" fill={BRAND.purple} />
        <h1
          className="font-[var(--font-heading)] text-4xl md:text-6xl tracking-tight"
          style={{ color: BRAND.ink }}
        >
          YOUR BAG
        </h1>
      </div>
      <HydratedBoundary
        fallback={<p className="text-slate-600 mb-8">Loading your bag…</p>}
      >
        <p className="text-slate-600 mb-8">
          {count === 0
            ? "Nothing in here yet."
            : `${count} ${count === 1 ? "item" : "items"}`}
        </p>

        {items.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center border border-zinc-200 shadow-sm">
            <Image
              src="/icons/ninja/emoji/thank-you@128.png"
              alt=""
              width={120}
              height={120}
              className="mx-auto h-28 w-28 object-contain mb-4"
            />
            <p className="text-xl font-bold mb-2 text-zinc-900">
              Your bag is empty.
            </p>
            <p className="text-zinc-600 mb-6">Pick something stealthy.</p>
            <Link
              href="/shop"
              className="inline-flex items-center rounded-full px-8 py-4 font-bold shadow-[0_4px_0_rgba(11,16,32,0.15)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] transition min-h-[60px]"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              Browse drops
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_320px] gap-8">
            <ul className="flex flex-col gap-4">
              {items.map((i) => (
                <li key={i.key}>
                  <CartLineRow item={i} variant="full" />
                </li>
              ))}
            </ul>

            <aside className="rounded-3xl bg-white p-6 border border-zinc-200 shadow-sm h-fit lg:sticky lg:top-24">
              <h2 className="font-[var(--font-heading)] text-2xl mb-4 text-zinc-900">
                Order summary
              </h2>
              <dl className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-600">Subtotal</dt>
                  <dd className="font-bold text-zinc-900">{formatMYR(subtotal)}</dd>
                </div>
                <div className="flex items-center justify-between text-sm text-zinc-500">
                  <dt>Shipping</dt>
                  <dd>Calculated at checkout</dd>
                </div>
              </dl>
              {/* /checkout is a Phase 3 target; D-03 accepts a 404 until then. */}
              <Link
                href="/checkout"
                className="w-full inline-flex items-center justify-center rounded-full px-6 py-4 font-bold text-lg shadow-[0_4px_0_rgba(11,16,32,0.15)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] transition min-h-[60px]"
                style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
              >
                Checkout · {formatMYR(subtotal)}
              </Link>
              <Link
                href="/shop"
                className="w-full inline-flex items-center justify-center rounded-full px-6 py-3 font-semibold text-sm mt-3 border-2 min-h-[48px] border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              >
                Keep shopping
              </Link>
            </aside>
          </div>
        )}
      </HydratedBoundary>
    </div>
  );
}
