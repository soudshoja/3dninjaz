"use client";

import type { HydratedCartItem } from "@/actions/cart";
import type { AddressFormValues } from "./address-form";
import type { SelectedShipping } from "./shipping-rate-picker";
import { formatMYR } from "@/lib/format";

/**
 * WhatsApp direct-bank-transfer CTA (wa.me deep link).
 *
 * Opens WhatsApp with a pre-filled message that includes:
 *   - Friendly opener
 *   - Order line items (name × qty, variant label)
 *   - Subtotal + shipping total in MYR
 *   - Customer name + email
 *   - Shipping address
 *
 * No DB write is performed — the order status enum does not include a
 * pending_bank_transfer value. The admin confirms the order manually after
 * receiving the transfer screenshot via WhatsApp.
 */

const WA_NUMBER = "60167203048";

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
  items,
  subtotal,
  shipping,
  address,
  customerName,
  customerEmail,
}: {
  items: HydratedCartItem[];
  subtotal: number;
  shipping: SelectedShipping | null;
  address: AddressFormValues | null;
  customerName: string;
  customerEmail: string;
}): string {
  const lines: string[] = [];

  lines.push("Hi 3D Ninjaz! I'd like to pay via direct bank transfer.");
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

  lines.push("");
  lines.push("Please send me the bank transfer details. I'll send the screenshot once done!");

  return lines.join("\n");
}

export function WhatsAppBankTransferButton({
  items,
  subtotal,
  shipping,
  address,
  customerName,
  customerEmail,
  disabled,
}: {
  items: HydratedCartItem[];
  subtotal: number;
  shipping: SelectedShipping | null;
  address: AddressFormValues | null;
  customerName: string;
  customerEmail: string;
  disabled?: boolean;
}) {
  const isDisabled = disabled || items.length === 0;

  function handleClick() {
    if (isDisabled) return;
    const message = buildMessage({
      items,
      subtotal,
      shipping,
      address,
      customerName,
      customerEmail,
    });
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-4">
      {/* Divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-black/10" />
        <span className="text-xs text-slate-500 whitespace-nowrap">
          Or pay via direct bank transfer
        </span>
        <div className="flex-1 h-px bg-black/10" />
      </div>

      {/* Explanatory copy */}
      <p className="text-xs text-slate-500 text-center mb-3">
        Click below to message us on WhatsApp. Send the screenshot of your transfer and we&apos;ll confirm your order.
      </p>

      {/* WhatsApp CTA */}
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label="Pay via WhatsApp direct bank transfer"
        className="w-full flex items-center justify-center gap-2 rounded-full py-3 px-6 font-bold text-sm text-black shadow-[0_4px_0_rgba(0,0,0,0.25)] active:translate-y-[1px] active:shadow-[0_2px_0_rgba(0,0,0,0.25)] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        style={{ backgroundColor: "#39E600" }}
      >
        <WhatsAppIcon className="h-5 w-5 shrink-0" />
        Pay via WhatsApp
      </button>
    </div>
  );
}
