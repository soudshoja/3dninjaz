/**
 * WhatsApp notification event keys, labels, variable hints, default templates,
 * and the seed helper.
 *
 * NOT "use server" — safe to import from both client and server.
 * Templates and event keys are co-located here so the editor sidebar can read
 * the variable hints without a DB round-trip.
 *
 * TODO: wire order_cancelled when a cancellation flow calls the email sender
 * (sendOrderCancelledEmail exists in send-emails.ts but has no confirmed
 * call site at the time of writing — confirm with the team before wiring).
 */

import type { WhatsappNotificationSeed } from "@/lib/db/schema";

export const WHATSAPP_EVENT_KEYS = [
  "order_pending",
  "order_bank_transfer_instructions",
  "order_approved",
  "order_confirmation",
  "order_processing",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "order_refunded",
  "return_requested",
  "return_approved",
  "return_rejected",
  "return_received",
  "return_expired",
] as const;

export type WhatsappEventKey = (typeof WHATSAPP_EVENT_KEYS)[number];

export const WHATSAPP_EVENT_LABELS: Record<WhatsappEventKey, string> = {
  order_pending: "Order pending — payment link",
  order_bank_transfer_instructions:
    "Bank transfer — payment instructions (auto-sent on WhatsApp order)",
  order_approved: "Order approved / payment confirmed",
  order_confirmation: "Order confirmed / paid (PayPal)",
  order_processing: "Order processing",
  order_shipped: "Order shipped",
  order_delivered: "Order delivered",
  order_cancelled: "Order cancelled",
  order_refunded: "Order refunded",
  return_requested: "Return requested",
  return_approved: "Return approved",
  return_rejected: "Return rejected",
  return_received: "Return received",
  return_expired: "Return window expired",
};

// Variables each event template may use (surfaced in the editor sidebar).
export const WHATSAPP_EVENT_VARIABLES: Record<WhatsappEventKey, string[]> = {
  order_pending:      ["customerName", "orderNumber", "orderTotal", "paymentLink"],
  order_bank_transfer_instructions: [
    "customerName", "orderNumber", "orderTotal",
    "bankName", "bankAccountNumber", "bankAccountHolder",
  ],
  order_approved:     ["customerName", "orderNumber", "orderUrl"],
  order_confirmation: ["customerName", "orderNumber", "orderTotal", "orderUrl"],
  order_processing:   ["customerName", "orderNumber", "orderUrl"],
  order_shipped:      ["customerName", "orderNumber", "courierName", "trackingNo", "trackingUrl"],
  order_delivered:    ["customerName", "orderNumber", "orderUrl"],
  order_cancelled:    ["customerName", "orderNumber", "reason"],
  order_refunded:     ["customerName", "orderNumber", "refundAmount"],
  return_requested:   ["customerName", "orderNumber"],
  return_approved:    ["customerName", "orderNumber", "shipByDate"],
  return_rejected:    ["customerName", "orderNumber", "reason"],
  return_received:    ["customerName", "orderNumber"],
  return_expired:     ["customerName", "orderNumber"],
};

const DEFAULT_TEMPLATES: Record<WhatsappEventKey, string> = {
  order_pending:
    "Hi {{customerName}}, your 3D Ninjaz order {{orderNumber}} (RM {{orderTotal}}) is reserved! Complete payment here: {{paymentLink}} — link valid for 30 days.",
  // Auto-sent the moment a WhatsApp bank-transfer order is created — the
  // amount always matches that order's total (admin request 2026-06-13).
  order_bank_transfer_instructions:
    "Hi, from 3D Ninjaz\n\nTo proceed with your order, please make payment via bank transfer using the details below:\n\n{{bankAccountHolder}}\n{{bankName}}\n{{bankAccountNumber}}\n\nTotal to be paid {{orderTotal}}\n\nOnce payment has been paid please provide us with the bank in statement to confirm your order.\n\nThank you for supporting 3D Ninjaz! 😊\n\nKind regards,\n3D Ninjaz\n🌐 www.3dninjaz.com\nInstagram: @3dninjaz",
  order_approved:
    "Hi {{customerName}}, great news! Your payment for order {{orderNumber}} has been confirmed. We'll start preparing it soon. Track it: {{orderUrl}}",
  order_confirmation:
    "Hi {{customerName}}! 🥷 Your 3D Ninjaz order {{orderNumber}} is confirmed. Total: {{orderTotal}}. Track it: {{orderUrl}}",
  order_processing:
    "Hi {{customerName}}, your order {{orderNumber}} is now being prepared. We'll update you when it ships.",
  order_shipped:
    "Good news {{customerName}}! Order {{orderNumber}} has shipped via {{courierName}}. Tracking: {{trackingNo}} {{trackingUrl}}",
  order_delivered:
    "Your order {{orderNumber}} has been delivered, {{customerName}}. Enjoy! 🎉",
  order_cancelled:
    "Hi {{customerName}}, your order {{orderNumber}} has been cancelled. {{reason}}",
  order_refunded:
    "Hi {{customerName}}, a refund of {{refundAmount}} for order {{orderNumber}} has been processed.",
  return_requested:
    "Hi {{customerName}}, we received your return request for order {{orderNumber}}. We'll review it shortly.",
  return_approved:
    "Hi {{customerName}}, your return for order {{orderNumber}} is approved. Please ship it back by {{shipByDate}}.",
  return_rejected:
    "Hi {{customerName}}, your return request for order {{orderNumber}} was not approved. {{reason}}",
  return_received:
    "Hi {{customerName}}, we've received your returned item for order {{orderNumber}}. Thank you!",
  return_expired:
    "Hi {{customerName}}, your return window for order {{orderNumber}} has expired as the item was not shipped within the required timeframe. Please contact support if you need help.",
};

export function seedWhatsappNotifications(): WhatsappNotificationSeed[] {
  return WHATSAPP_EVENT_KEYS.map((eventKey) => ({
    eventKey,
    enabled: true,
    template: DEFAULT_TEMPLATES[eventKey],
  }));
}

// Pure renderer — substitutes {{var}} with vars[var] (missing → "").
export function renderWhatsappTemplate(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

// Normalise a MY phone to Evolution digit form (country code, no +, no spaces).
// "+60 11 2543 4730" → "601125434730"; "0125434730" → "60125434730".
export function normalizeMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "60" + d.slice(1);
  if (!d.startsWith("60") && d.length <= 10) d = "60" + d;
  return d.length >= 10 ? d : null;
}
