"use client";

import Link from "next/link";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { useCartStore } from "@/stores/cart-store";
import { formatMYR } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { CartLineRow } from "@/components/store/cart-line-row";

/**
 * The single mounted-in-layout drawer surface. Opens whenever any code
 * calls `useCartStore.getState().setDrawerOpen(true)`. Empty state uses
 * the D-02 "Your bag is empty." vocabulary.
 */
export function CartDrawer() {
  const isOpen = useCartStore((s) => s.isDrawerOpen);
  const setOpen = useCartStore((s) => s.setDrawerOpen);
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.getSubtotal());
  const count = useCartStore((s) => s.getItemCount());

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
          {items.length === 0 ? (
            <div className="py-16 text-center">
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
          ) : (
            items.map((i) => <CartLineRow key={i.key} item={i} variant="compact" />)
          )}
        </div>

        {items.length > 0 ? (
          <DrawerFooter>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-600">Subtotal</span>
              <span className="font-[var(--font-heading)] text-2xl text-zinc-900">
                {formatMYR(subtotal)}
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
