"use client";

import { useState, useTransition } from "react";
import type { HydratedCartItem } from "@/actions/cart";
import type { AddressFormValues } from "./address-form";
import type { SelectedShipping } from "./shipping-rate-picker";
import { formatMYR } from "@/lib/format";
import { createWhatsAppOrder } from "@/actions/whatsapp-order";

/**
 * WhatsApp direct-bank-transfer CTA.
 *
 * On click:
 *   1. Calls createWhatsAppOrder server action to persist the order in the DB
 *      with status "awaiting_payment_review" and paymentMethod "bank_transfer".
 *   2. On success, opens a wa.me deep link pre-filled with the full order
 *      summary including the order reference, bank transfer details, and
 *      shipping address.
 *   3. On error, shows an inline error message below the button.
 */

// WhatsApp SVG logo (official green brand mark, no external dependency)
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function buildMessage({
  orderId,
  items,
  subtotal,
  shipping,
  address,
  customerName,
  customerEmail,
  bankName,
  bankAccountNumber,
  bankAccountHolder,
}: {
  orderId: string;
  items: HydratedCartItem[];
  subtotal: number;
  shipping: SelectedShipping | null;
  address: AddressFormValues | null;
  customerName: string;
  customerEmail: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
}): string {
  const lines: string[] = [];
  const orderRef = orderId.slice(0, 8).toUpperCase();

  lines.push("Hi 3D Ninjaz! I just placed an order on your website and would like to pay via bank transfer.");
  lines.push("");
  lines.push(`*Order Reference: #${orderRef}*`);
  lines.push("");
  lines.push("*Order Summary*");

  for (const item of items) {
    const label = item.variantLabel ? ` (${item.variantLabel})` : "";
    const lineTotal = parseFloat(item.unitPrice) * item.quantity;
    lines.push(
      `• ${item.productName}${label} × ${item.quantity} — ${formatMYR(lineTotal)}`,
    );
  }

  lines.push("");
  lines.push(`Subtotal: ${formatMYR(subtotal)}`);

  if (shipping) {
    lines.push(`Shipping (${shipping.serviceName}): ${formatMYR(shipping.price)}`);
    const total = subtotal + shipping.price;
    lines.push(`*Total: ${formatMYR(total)}*`);
  } else {
    lines.push(`*Total: ${formatMYR(subtotal)}* (+ shipping TBC)`);
  }

  lines.push("");
  lines.push("*My Details*");
  lines.push(`Name: ${customerName}`);
  lines.push(`Email: ${customerEmail}`);

  if (address) {
    lines.push("");
    lines.push("*Shipping Address*");
    lines.push(address.recipientName);
    lines.push(address.phone);
    lines.push(address.addressLine1);
    if (address.addressLine2) lines.push(address.addressLine2);
    lines.push(`${address.city}, ${address.state} ${address.postcode}`);
    lines.push("Malaysia");
  }

  if (bankName && bankAccountNumber) {
    lines.push("");
    lines.push("*Bank Transfer Details*");
    lines.push(`Bank: ${bankName}`);
    lines.push(`Account No: ${bankAccountNumber}`);
    if (bankAccountHolder) lines.push(`Account Name: ${bankAccountHolder}`);
  }

  lines.push("");
  lines.push("I will send my transfer screenshot shortly. Thank you!");

  return lines.join("\n");
}

export function WhatsAppBankTransferButton({
  items,
  subtotal,
  shipping,
  address,
  customerName,
  customerEmail,
  couponCode,
  waNumber,
  bankName,
  bankAccountNumber,
  bankAccountHolder,
  guestName,
  guestEmail,
  disabled,
}: {
  items: HydratedCartItem[];
  subtotal: number;
  shipping: SelectedShipping | null;
  address: AddressFormValues | null;
  customerName: string;
  customerEmail: string;
  couponCode: string | null;
  waNumber: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
  guestName?: string;
  guestEmail?: string;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDisabled = disabled || items.length === 0 || !address || !shipping || isPending;

  function handleClick() {
    if (isDisabled) return;
    setError(null);

    const bagLines = items.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      configurationData: i.configurationData ?? null,
      productId: i.productId,
    }));

    startTransition(async () => {
      const res = await createWhatsAppOrder({
        address: address!,
        items: bagLines,
        couponCode: couponCode ?? null,
        shippingServiceCode: shipping?.serviceCode ?? null,
        guestName,
        guestEmail,
      });

      if (!res.ok) {
        setError(res.error ?? "Something went wrong. Please try again.");
        return;
      }

      const message = buildMessage({
        orderId: res.orderId,
        items,
        subtotal,
        shipping,
        address,
        customerName,
        customerEmail,
        bankName,
        bankAccountNumber,
        bankAccountHolder,
      });
      const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="mt-3">
      {/* "or" pill divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-zinc-200" />
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium whitespace-nowrap px-1">
          or
        </span>
        <div className="flex-1 h-px bg-zinc-200" />
      </div>

      {/* Explanatory copy */}
      <p className="text-xs text-slate-500 text-center mb-3">
        Your order will be saved automatically — just send us your transfer screenshot to confirm.
      </p>

      {/* WhatsApp CTA */}
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label="Pay via WhatsApp direct bank transfer"
        className="w-full flex items-center justify-center gap-2 rounded-full py-3 px-6 font-bold text-sm text-black shadow-[0_4px_0_rgba(0,0,0,0.25)] active:translate-y-[1px] active:shadow-[0_2px_0_rgba(0,0,0,0.25)] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        style={{ backgroundColor: "#25D366" }}
      >
        <WhatsAppIcon className="h-5 w-5 shrink-0" />
        {isPending ? "Placing order…" : "Pay via WhatsApp"}
      </button>

      {error ? (
        <p className="text-red-600 text-xs mt-2 text-center">{error}</p>
      ) : null}
    </div>
  );
}
