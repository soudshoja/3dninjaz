"use client";

/**
 * Phase 20 (20-09) — Post-submit "Send order to customer?" modal.
 *
 * Initial state:
 *   - "Yes — generate draft link" (auto-focused, green 60px)
 *   - "No — keep as pending" (outlined ink 48px)
 *
 * On Yes:
 *   1. generatePaymentLink(orderId) → get URL
 *   2. setOrderAwaitingCustomer(orderId) → transition pending → awaiting_customer
 *   3. Swap modal body to success state with three send options:
 *        a. "Send via WhatsApp" (programmatic) — sendPosPaymentLinkWhatsApp(orderId)
 *        b. "Open WhatsApp" (deep link, manual) — wa.me deep-link (unchanged)
 *        c. "Open email draft" (mailto deep link, unchanged)
 *      Plus: "Send invoice PDF via WhatsApp" — sendPosInvoicePdfWhatsApp(orderId)
 *
 * WhatsApp deeplink: https://wa.me/<phoneE164>?text=<encoded>
 *   - Phone normalisation: strip non-digits, prepend "6" if starts with "0"
 *   - Template from draftLinkTemplate setting; fallback hardcoded.
 *
 * Email deeplink: mailto:<email>?subject=…&body=…
 *
 * D-17, D-18 per 20-CONTEXT.md.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Link as LinkIcon,
  Copy,
  Check,
  MessageCircle,
  Mail,
  X,
  Loader2,
  Send,
  FileText,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { generatePaymentLink } from "@/actions/admin-manual-orders";
import {
  setOrderAwaitingCustomer,
  getDraftLinkTemplate,
} from "@/actions/admin-pos";
import {
  sendPosPaymentLinkWhatsApp,
  sendPosInvoicePdfWhatsApp,
} from "@/actions/pos-whatsapp";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a Malaysian phone number to E.164 (no + prefix). */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // If starts with 0, prepend Malaysian country code 6
  if (digits.startsWith("0")) return "6" + digits.slice(1);
  return digits;
}

/** Simple Mustache-style template renderer (client-side). */
function renderSimpleTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

const DEFAULT_DRAFT_TEMPLATE =
  "Hi {{customer_name}}, here's your order from 3D Ninjaz: {{link}}.";

function formatMYR(n: number) {
  return `MYR ${n.toFixed(2)}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  customerName: string;
  customerPhone: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PosSendDraftModal({
  open,
  onClose,
  orderId,
  orderNumber,
  orderTotal,
  customerName,
  customerPhone,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Success state
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draftTemplate, setDraftTemplate] = useState<string | null>(null);

  // Programmatic WA send states
  const [waSendLinkPending, startWaSendLinkTransition] = useTransition();
  const [waSendInvoicePending, startWaSendInvoiceTransition] = useTransition();
  const [waSendLinkStatus, setWaSendLinkStatus] = useState<"idle" | "ok" | "err">("idle");
  const [waSendInvoiceStatus, setWaSendInvoiceStatus] = useState<"idle" | "ok" | "err">("idle");
  const [waSendLinkError, setWaSendLinkError] = useState<string | null>(null);
  const [waSendInvoiceError, setWaSendInvoiceError] = useState<string | null>(null);

  // Auto-focus the Yes button
  const yesBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open && yesBtnRef.current && !paymentUrl) {
      yesBtnRef.current.focus();
    }
  }, [open, paymentUrl]);

  // Load draft template (best-effort; fallback to hardcoded)
  useEffect(() => {
    if (!open) return;
    getDraftLinkTemplate()
      .then((tmpl) => {
        if (tmpl) setDraftTemplate(tmpl);
      })
      .catch(() => {
        // Ignore — use default template
      });
  }, [open]);

  if (!open) return null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleNo() {
    router.push(`/admin/orders/${orderId}`);
    onClose();
  }

  function handleYes() {
    setError(null);
    startTransition(async () => {
      // Step 1: generate payment link
      const linkResult = await generatePaymentLink({ orderId });
      if (!linkResult.ok) {
        setError(linkResult.error);
        return;
      }

      // Step 2: transition order to awaiting_customer
      const transitionResult = await setOrderAwaitingCustomer(orderId);
      if (!transitionResult.ok) {
        // Non-fatal — link still generated; show warning but continue
        console.warn("[pos-send-draft-modal] transition failed:", transitionResult.error);
      }

      setPaymentUrl(linkResult.url);
    });
  }

  async function handleCopy() {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available — silently skip
    }
  }

  function handleDone() {
    router.push(`/admin/orders/${orderId}`);
    onClose();
  }

  // ── Programmatic WA: send payment link ────────────────────────────────────

  function handleSendPaymentLinkViaWhatsApp() {
    setWaSendLinkStatus("idle");
    setWaSendLinkError(null);
    startWaSendLinkTransition(async () => {
      const result = await sendPosPaymentLinkWhatsApp(orderId);
      if (result.ok) {
        setWaSendLinkStatus("ok");
        // Update the displayed URL in case it regenerated
        if (result.link && !paymentUrl) setPaymentUrl(result.link);
      } else {
        setWaSendLinkStatus("err");
        setWaSendLinkError(result.error);
      }
    });
  }

  // ── Programmatic WA: send invoice PDF ────────────────────────────────────

  function handleSendInvoicePdfViaWhatsApp() {
    setWaSendInvoiceStatus("idle");
    setWaSendInvoiceError(null);
    startWaSendInvoiceTransition(async () => {
      const result = await sendPosInvoicePdfWhatsApp(orderId);
      if (result.ok) {
        setWaSendInvoiceStatus("ok");
      } else {
        setWaSendInvoiceStatus("err");
        setWaSendInvoiceError(result.error);
      }
    });
  }

  // ── Template rendering ─────────────────────────────────────────────────────

  const template = draftTemplate || DEFAULT_DRAFT_TEMPLATE;
  const templateVars = {
    customer_name: customerName,
    order_number: orderNumber,
    total: formatMYR(orderTotal),
    link: paymentUrl ?? "",
  };
  const messageBody = renderSimpleTemplate(template, templateVars);

  const phoneE164 = normalisePhone(customerPhone);
  const waUrl = paymentUrl
    ? `https://wa.me/${phoneE164}?text=${encodeURIComponent(messageBody)}`
    : "";
  const mailtoUrl = paymentUrl
    ? `mailto:?subject=${encodeURIComponent(`Your 3D Ninjaz order ${orderNumber}`)}&body=${encodeURIComponent(messageBody)}`
    : "";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(11,16,32,0.6)" }}
      onClick={handleDone}
      role="dialog"
      aria-modal="true"
      aria-label="Send order to customer"
    >
      {/* Modal panel */}
      <div
        className="relative w-full max-w-[480px] rounded-[4px] border-2 bg-white p-6"
        style={{ borderColor: BRAND.ink }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDone}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-[4px] text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {!paymentUrl ? (
          /* ── Initial state ── */
          <>
            <h3
              className="font-[var(--font-heading)] text-xl font-semibold mb-2"
              style={{ color: BRAND.ink }}
            >
              Send order to customer?
            </h3>

            <div className="mb-6 space-y-1">
              <p className="text-2xl font-bold font-[var(--font-heading)]" style={{ color: BRAND.ink }}>
                {orderNumber}
              </p>
              <p className="text-lg font-semibold tabular-nums" style={{ color: "#03C03C" }}>
                {formatMYR(orderTotal)}
              </p>
              <p className="text-sm text-slate-500">
                Generate a payment link and send it to the customer for review.
              </p>
            </div>

            {error ? (
              <div
                className="mb-4 rounded-[4px] border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              {/* Yes — primary */}
              <button
                ref={yesBtnRef}
                type="button"
                onClick={handleYes}
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 min-h-[60px] rounded-[4px] text-base font-semibold text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: "#03C03C" }}
                onMouseEnter={(e) => {
                  if (!pending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#018A29";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#03C03C";
                }}
              >
                {pending ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Working…
                  </>
                ) : (
                  "Yes — generate draft link"
                )}
              </button>

              {/* No — secondary */}
              <button
                type="button"
                onClick={handleNo}
                disabled={pending}
                className="flex w-full items-center justify-center min-h-[48px] rounded-[4px] border-2 text-sm font-semibold transition-colors disabled:opacity-60"
                style={{ borderColor: "#cbd5e1", color: BRAND.ink }}
              >
                No — keep as pending
              </button>
            </div>
          </>
        ) : (
          /* ── Success state ── */
          <>
            <h3
              className="font-[var(--font-heading)] text-xl font-semibold mb-2"
              style={{ color: BRAND.ink }}
            >
              Link ready
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Share this link with <strong>{customerName}</strong> to let them review
              and pay for order <strong>{orderNumber}</strong>.
            </p>

            {/* Copyable URL block */}
            <div
              className="flex items-center gap-2 rounded-[4px] border-2 border-slate-200 bg-slate-50 px-3 py-2 mb-4"
            >
              <LinkIcon size={16} className="text-slate-400 shrink-0" />
              <span className="flex-1 truncate font-mono text-xs text-slate-700">
                {paymentUrl}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center justify-center w-8 h-8 rounded-[4px] text-slate-500 hover:text-slate-700 transition-colors"
                aria-label="Copy link"
              >
                {copied ? (
                  <Check size={16} className="text-green-600" />
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </div>

            {/* ── Programmatic WhatsApp sends ── */}
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Send via server (uses Notification Center)
            </p>
            <div className="flex flex-col gap-2 mb-4">
              {/* Send payment link programmatically */}
              <button
                type="button"
                onClick={handleSendPaymentLinkViaWhatsApp}
                disabled={waSendLinkPending || waSendLinkStatus === "ok"}
                className="flex w-full items-center justify-center gap-2 min-h-[48px] rounded-[4px] text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: "#25D366" }}
              >
                {waSendLinkPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending…
                  </>
                ) : waSendLinkStatus === "ok" ? (
                  <>
                    <Check size={16} />
                    Payment link sent
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send payment link via WhatsApp
                  </>
                )}
              </button>
              {waSendLinkStatus === "err" && waSendLinkError && (
                <p className="text-xs text-red-600 px-1">{waSendLinkError}</p>
              )}

              {/* Send invoice PDF programmatically */}
              <button
                type="button"
                onClick={handleSendInvoicePdfViaWhatsApp}
                disabled={waSendInvoicePending || waSendInvoiceStatus === "ok"}
                className="flex w-full items-center justify-center gap-2 min-h-[48px] rounded-[4px] text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: "#128C7E" }}
              >
                {waSendInvoicePending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending PDF…
                  </>
                ) : waSendInvoiceStatus === "ok" ? (
                  <>
                    <Check size={16} />
                    Invoice PDF sent
                  </>
                ) : (
                  <>
                    <FileText size={16} />
                    Send invoice PDF via WhatsApp
                  </>
                )}
              </button>
              {waSendInvoiceStatus === "err" && waSendInvoiceError && (
                <p className="text-xs text-red-600 px-1">{waSendInvoiceError}</p>
              )}
            </div>

            {/* ── Manual deep-link options (unchanged) ── */}
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Open manually
            </p>
            <div className="flex flex-col gap-2 mb-6">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 min-h-[44px] rounded-[4px] border-2 text-sm font-semibold transition-colors"
                style={{
                  borderColor: "#25D366",
                  color: "#25D366",
                  backgroundColor: "#25D3660d",
                }}
              >
                <MessageCircle size={16} />
                Open WhatsApp (manual)
              </a>

              <a
                href={mailtoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 min-h-[44px] rounded-[4px] border-2 text-sm font-semibold transition-colors"
                style={{ borderColor: "#cbd5e1", color: BRAND.ink }}
              >
                <Mail size={16} />
                Open email draft
              </a>
            </div>

            {/* Done */}
            <button
              type="button"
              onClick={handleDone}
              className="flex w-full items-center justify-center min-h-[48px] rounded-[4px] border-2 text-sm font-semibold transition-colors"
              style={{ borderColor: BRAND.ink, color: BRAND.ink }}
            >
              Done — view order
            </button>
          </>
        )}
      </div>
    </div>
  );
}
