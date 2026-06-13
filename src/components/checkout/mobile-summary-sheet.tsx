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
import { CouponApply } from "@/components/store/coupon-apply";
import { PayPalButton } from "./paypal-button";
import { WhatsAppBankTransferButton } from "./whatsapp-bank-transfer-button";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import type { HydratedCartItem } from "@/actions/cart";
import type { AddressFormValues } from "./address-form";
import type { AppliedCoupon } from "@/components/store/coupon-apply";
import type { SelectedShipping } from "./shipping-rate-picker";

/**
 * Mobile-only sticky CTA dock + Review-and-Pay bottom sheet (D3-20).
 *
 * - Visible only below the `md` breakpoint (≤ 768px).
 * - Dock shows the current total and a "Review & Pay" button that opens
 *   a Drawer (vaul bottom-sheet shape on mobile) with the order summary
 *   plus the PayPal button and WhatsApp bank-transfer CTA.
 * - Tap targets: total+button row meets 60px minimum for primary CTAs
 *   (D3-20).
 * - For guests (isGuest=true): PayPal is replaced by a sign-in prompt.
 */
export function MobileSummarySheet({
  items,
  subtotalMyr,
  address,
  appliedCoupon,
  onCouponChange,
  shipping,
  onPaid,
  customerName,
  customerEmail,
  couponCode,
  waNumber,
  bankName,
  bankAccountNumber,
  bankAccountHolder,
  isGuest,
  guestName,
  guestEmail,
  guestEmailValid,
}: {
  items: HydratedCartItem[];
  subtotalMyr: number;
  address: AddressFormValues | null;
  appliedCoupon: AppliedCoupon | null;
  onCouponChange: (next: AppliedCoupon | null) => void;
  shipping: SelectedShipping | null;
  onPaid: (redirectTo: string) => void;
  customerName: string;
  customerEmail: string;
  couponCode: string | null;
  waNumber: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
  /** True when no session — hides coupon widget. */
  isGuest?: boolean;
  /** Guest full name — undefined when the user is authenticated. */
  guestName?: string;
  /** Guest checkout email — undefined when the user is authenticated. */
  guestEmail?: string;
  /** Whether the guest email input passes the format check (or is blank). */
  guestEmailValid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const discountedSubtotal = appliedCoupon
    ? appliedCoupon.finalTotal
    : subtotalMyr;
  const totalForDock = discountedSubtotal + (shipping?.price ?? 0);

  // The "Review & Pay" sheet is only for paying. If the address isn't valid
  // yet (or no courier), we DON'T open the sheet and show a "complete address"
  // message inside it — instead the dock button takes the customer straight
  // back to the form/courier section to finish (2026-06-13: customers found
  // "Complete shipping address" inside Review & Pay confusing). The sheet only
  // ever opens once everything is ready, so it's pure review + pay.
  const ready = address !== null && shipping !== null;
  const jumpToIncomplete = () => {
    setOpen(false);
    // Wait for any drawer close animation before scrolling.
    setTimeout(() => {
      if (address === null) {
        const ids = [
          "field-recipientName",
          "field-phone",
          "field-addressLine1",
          "field-city",
          "field-postcode",
          "field-state",
        ];
        const firstEmpty = ids
          .map((id) => document.getElementById(id))
          .find((el) =>
            el instanceof HTMLInputElement || el instanceof HTMLSelectElement
              ? !el.value
              : false,
          );
        const target = firstEmpty ?? document.getElementById("ship-heading");
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (
          firstEmpty instanceof HTMLInputElement ||
          firstEmpty instanceof HTMLSelectElement
        ) {
          firstEmpty.focus({ preventScroll: true });
        }
      } else {
        // Address valid but no courier yet — scroll to the shipping section.
        document
          .getElementById("ship-heading")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 350);
  };

  return (
    <>
      {/* Sticky bottom dock, mobile-only */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-black/10 bg-white shadow-lg">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[11px] text-slate-600 leading-none">Total</p>
            <p className="font-[var(--font-heading)] text-xl leading-tight">
              {formatMYR(totalForDock)}
            </p>
          </div>
          <button
            type="button"
            onClick={ready ? () => setOpen(true) : jumpToIncomplete}
            className="min-h-[60px] px-6 rounded-full font-bold text-white shadow-[0_6px_0_rgba(0,0,0,0.35)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(0,0,0,0.35)] transition"
            style={{ backgroundColor: BRAND.ink }}
          >
            {ready
              ? "Review & Pay"
              : address === null
                ? "Add your details"
                : "Choose delivery"}
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

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
            <CheckoutSummary
              items={items}
              subtotal={subtotalMyr}
              appliedCoupon={appliedCoupon}
              onCouponChange={onCouponChange}
              shipping={shipping}
              showCoupon={false}
              isGuest={isGuest}
            />
            {/* Coupon below the order total */}
            <div className="mt-4">
              <CouponApply
                subtotal={subtotalMyr}
                applied={appliedCoupon}
                onChange={onCouponChange}
              />
            </div>
          </div>

          <DrawerFooter>
            {/* Pay eyebrow — mirrors desktop right-column hierarchy */}
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium px-1 mb-1">
              Pay
            </p>
            {/* PayPal + WhatsApp side-by-side — both options equally available
                in every browser (the customer chooses whichever they prefer). */}
            <div className="flex items-stretch gap-2 [&>*]:flex-1 [&>*]:min-w-0">
              <PayPalButton
                address={address}
                items={items}
                appliedCouponCode={appliedCoupon?.code ?? null}
                shipping={shipping}
                onPaid={(redirect) => {
                  setOpen(false);
                  onPaid(redirect);
                }}
                guestEmail={guestEmail}
                guestEmailValid={guestEmailValid}
              />
              <WhatsAppBankTransferButton
                compact
                items={items}
                subtotal={subtotalMyr}
                shipping={shipping}
                address={address}
                customerName={customerName}
                customerEmail={customerEmail}
                couponCode={couponCode}
                discount={appliedCoupon?.discount ?? 0}
                waNumber={waNumber}
                bankName={bankName}
                bankAccountNumber={bankAccountNumber}
                bankAccountHolder={bankAccountHolder}
                guestName={isGuest ? guestName : undefined}
                guestEmail={isGuest ? guestEmail : undefined}
                disabled={items.length === 0 || (isGuest === true && !(guestName ?? "").trim())}
              />
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
