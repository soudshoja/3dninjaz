"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { CheckoutSummary } from "./checkout-summary";
import { PayPalButton } from "./paypal-button";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import type { CartItem } from "@/stores/cart-store";
import type { AddressFormValues } from "./address-form";

/**
 * Mobile-only sticky CTA dock + Review-and-Pay bottom sheet (D3-20).
 *
 * - Visible only below the `md` breakpoint (≤ 768px).
 * - Dock shows the current total and a "Review & Pay" button that opens
 *   a Drawer (vaul bottom-sheet shape on mobile) with the order summary
 *   plus the PayPal button.
 * - Tap targets: total+button row meets 60px minimum for primary CTAs
 *   (D3-20).
 */
export function MobileSummarySheet({
  items,
  subtotalMyr,
  address,
  onPaid,
}: {
  items: CartItem[];
  subtotalMyr: number;
  address: AddressFormValues | null;
  onPaid: (redirectTo: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Sticky bottom dock, mobile-only */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-black/10 bg-white shadow-lg">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[11px] text-slate-600 leading-none">Total</p>
            <p className="font-[var(--font-heading)] text-xl leading-tight">
              {formatMYR(subtotalMyr)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[60px] px-6 rounded-full font-bold text-white shadow-[0_6px_0_rgba(0,0,0,0.35)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(0,0,0,0.35)] transition"
            style={{ backgroundColor: BRAND.ink }}
          >
            Review &amp; Pay
          </button>
        </div>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent aria-label="Review and pay">
          <DrawerHeader className="flex items-start justify-between gap-4">
            <DrawerTitle>Review &amp; pay</DrawerTitle>
            <DrawerClose
              aria-label="Close"
              className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-full hover:bg-black/5"
            >
              <X className="h-5 w-5" aria-hidden />
            </DrawerClose>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-5 py-3">
            <CheckoutSummary items={items} subtotal={subtotalMyr} />
          </div>

          <DrawerFooter>
            <PayPalButton
              address={address}
              items={items}
              onPaid={(redirect) => {
                setOpen(false);
                onPaid(redirect);
              }}
            />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
