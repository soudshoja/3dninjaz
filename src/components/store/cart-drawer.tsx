"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { useCartStore, isConfigurableCartItem } from "@/stores/cart-store";
import { hydrateCartItems, type HydratedCartItem } from "@/actions/cart";
import { formatMYR } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { CartLineRow } from "@/components/store/cart-line-row";

/**
 * Phase 16-05: cart drawer hydrates display data (label, price, image) from
 * the server on open. The Zustand store holds only { variantId, quantity }.
 *
 * Hydration is triggered whenever the drawer opens or the item list changes.
 * While loading we show the existing skeleton (item count still readable from
 * the lean store). Items that no longer exist in the DB are silently dropped
 * and removed from the store.
 */
export function CartDrawer() {
  const isOpen = useCartStore((s) => s.isDrawerOpen);
  const setOpen = useCartStore((s) => s.setDrawerOpen);
  const storeItems = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const count = useCartStore((s) => s.getItemCount());

  const [hydrated, setHydrated] = useState<HydratedCartItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Re-hydrate whenever the drawer is open and store items change.
  useEffect(() => {
    if (!isOpen || storeItems.length === 0) {
      setHydrated([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    hydrateCartItems(storeItems)
      .then((items) => {
        if (cancelled) return;
        setHydrated(items);
        // Drop store items whose variants/products were deleted/inactive.
        // Stocked lines key on variantId; configurable lines key on productId.
        const liveKeys = new Set(
          items.map((i) => (i.productType === "configurable" || i.productType === "keychain" || i.productType === "vending" ? i.productId : i.variantId))
        );
        for (const si of storeItems) {
          const lookupKey = isConfigurableCartItem(si) ? si.productId : si.variantId;
          if (!liveKeys.has(lookupKey)) removeItem(si.key);
        }
      })
      .catch(() => { /* silent — stale display is acceptable */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, storeItems.length]);

  const subtotal = hydrated.reduce(
    (sum, i) => sum + parseFloat(i.unitPrice) * i.quantity,
    0,
  );

  return (
    <Drawer open={isOpen} onOpenChange={setOpen}>
      <DrawerContent aria-label="Your bag">
        <DrawerHeader className="flex items-start justify-between gap-4">
          <div>
            <DrawerTitle>Your bag</DrawerTitle>
            <DrawerDescription>
              {count === 0
                ? "Nothing in here yet."
                : `${count} ${count === 1 ? "item" : "items"}`}
            </DrawerDescription>
          </div>
          <DrawerClose
            aria-label="Close bag"
            className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-full hover:bg-black/5"
          >
            <X className="h-5 w-5" aria-hidden />
          </DrawerClose>
        </DrawerHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 divide-y divide-black/10">
          {storeItems.length === 0 ? (
            <div className="py-16 text-center">
              <Image
                src="/icons/ninja/emoji/thank-you@128.png"
                alt=""
                width={96}
                height={96}
                className="mx-auto h-24 w-24 object-contain mb-3"
              />
              <p className="text-lg font-bold mb-2 text-zinc-900">Your bag is empty.</p>
              <p className="text-zinc-600 mb-6">Pick something stealthy.</p>
              <Link
                href="/shop"
                onClick={() => setOpen(false)}
                className="inline-flex items-center rounded-full px-6 py-3 font-bold min-h-[48px] shadow-[0_4px_0_rgba(11,16,32,0.15)]"
                style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
              >
                Browse drops
              </Link>
            </div>
          ) : loading ? (
            <div className="py-10 text-center text-sm text-zinc-500">Loading…</div>
          ) : (
            hydrated.map((i) => (
              <CartLineRow key={i.storeKey ?? i.variantId} item={i} variant="compact" />
            ))
          )}
        </div>

        {storeItems.length > 0 ? (
          <DrawerFooter>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-600">Subtotal</span>
              <span className="font-[var(--font-heading)] text-2xl text-zinc-900">
                {loading ? "—" : formatMYR(subtotal)}
              </span>
            </div>
            <div className="flex gap-3">
              <Link
                href="/bag"
                onClick={() => setOpen(false)}
                className="flex-1 inline-flex items-center justify-center rounded-full px-5 py-3 font-bold border-2 border-zinc-300 text-zinc-800 hover:bg-zinc-50 min-h-[48px]"
              >
                View bag
              </Link>
              {/* /checkout is a Phase 3 target; D-03 accepts a 404 until then. */}
              <Link
                href="/checkout"
                onClick={() => setOpen(false)}
                className="flex-1 inline-flex items-center justify-center rounded-full px-5 py-3 font-bold shadow-[0_4px_0_rgba(11,16,32,0.15)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] transition min-h-[60px]"
                style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
              >
                Checkout
              </Link>
            </div>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
