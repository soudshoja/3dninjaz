"use client";

import { useEffect, useState } from "react";
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

  // Payment is blocked until the address form is valid + a courier picked —
  // but the form is BEHIND this sheet. Without an actionable way back,
  // customers get stuck reading "complete your shipping address" with no
  // address form in sight (incident 2026-06-13, Instagram in-app browser).
  const payBlocked = address === null || shipping === null;
  const jumpToAddress = () => {
    setOpen(false);
    // Wait for the drawer close animation before scrolling.
    setTimeout(() => {
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
        .find(
          (el) =>
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
    }, 350);
  };

  // In-app browsers (Instagram/Facebook/TikTok webviews) are unreliable for
  // the PayPal popup. Detect once on the client; SSR renders false.
  const [inAppBrowser, setInAppBrowser] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    setInAppBrowser(/Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Line\//i.test(ua));
  }, []);

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
            {payBlocked ? (
              <button
                type="button"
                onClick={jumpToAddress}
                className="w-full min-h-[48px] mb-2 rounded-full font-bold text-white shadow-[0_4px_0_rgba(0,0,0,0.25)] active:translate-y-[1px] transition"
                style={{ backgroundColor: BRAND.blue }}
              >
                {address === null
                  ? "Complete shipping address →"
                  : "Pick a courier →"}
              </button>
            ) : null}
            {inAppBrowser && !payBlocked ? (
              <p
                className="rounded-xl px-3 py-2 mb-2 text-xs"
                style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
              >
                You&apos;re in an in-app browser. If PayPal doesn&apos;t open,
                use <strong>Pay via WhatsApp</strong> — or open this page in
                Safari/Chrome.
              </p>
            ) : null}
            {/* PayPal + WhatsApp side-by-side to save vertical space on mobile.
                Each column takes half the row; min-w-0 lets them shrink. */}
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
