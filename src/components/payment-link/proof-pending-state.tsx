import { CheckCircle2, MessageCircle } from "lucide-react";
import { formatMYR } from "@/lib/format";
import type { PaymentLinkProof } from "@/actions/payment-links";

interface Props {
  orderNumber: string;
  orderTotal: string;
  currency: string;
  bankSettings: {
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolder: string;
  } | null;
  latestProof: PaymentLinkProof;
  whatsAppHref: string;
}

/**
 * Phase 20 (20-08) — "Being reviewed" success state.
 *
 * D-15: Shown after customer successfully uploads a payment slip.
 * Renders when order is in `awaiting_payment_review` status.
 * Re-displays order summary, bank details (read-only), uploaded thumbnail (96px),
 * ETA copy, and WhatsApp support deeplink.
 */
export function ProofPendingState({
  orderNumber,
  orderTotal,
  currency,
  bankSettings,
  latestProof,
  whatsAppHref,
}: Props) {
  const amountLabel = `MYR ${formatMYR(orderTotal)}`.replace("RM ", "MYR ");
  const isPdf = latestProof.mimeType === "application/pdf";

  return (
    <div className="space-y-6">
      {/* Success header */}
      <div className="flex flex-col items-center text-center gap-3">
        <CheckCircle2
          size={56}
          className="text-[#03C03C]"
          aria-hidden
        />
        <div>
          <h2 className="font-[var(--font-heading)] text-[22px] font-semibold text-[#0B1020]">
            Proof received
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-xs">
            Admin will confirm within 24 hours. We&apos;ll update you on WhatsApp.
          </p>
        </div>
      </div>

      {/* Order reference */}
      <div className="rounded-[4px] border-2 border-slate-200 bg-white px-4 py-3">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
          Order reference
        </p>
        <p className="mt-1 font-semibold text-[#0B1020]">{orderNumber}</p>
        <p
          className="mt-0.5 font-[var(--font-heading)] text-[22px] font-semibold text-[#0B1020]"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          {formatMYR(orderTotal)} {currency}
        </p>
      </div>

      {/* Bank details — read-only chips for customer to re-verify */}
      {bankSettings ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
            Transferred to
          </p>
          <ReadOnlyChip label="Bank" value={bankSettings.bankName} />
          <ReadOnlyChip
            label="Account number"
            value={bankSettings.bankAccountNumber}
            mono
          />
          <ReadOnlyChip
            label="Account holder"
            value={bankSettings.bankAccountHolder}
          />
          <ReadOnlyChip
            label="Amount"
            value={amountLabel}
            large
            green
          />
        </div>
      ) : null}

      {/* Uploaded slip thumbnail (96px) */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
          Your uploaded slip
        </p>
        <div className="flex items-start gap-3">
          {!isPdf ? (
            <div className="flex-shrink-0 w-24 h-24 rounded-[12px] overflow-hidden border-2 border-slate-200 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={latestProof.thumbnailUrl ?? latestProof.imageUrl}
                alt="Your payment slip"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="flex-shrink-0 w-24 h-24 rounded-[4px] border-2 border-slate-200 bg-slate-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-400"
                aria-hidden
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-slate-500 leading-tight">
              Submitted{" "}
              {new Date(latestProof.createdAt).toLocaleString("en-MY", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {latestProof.mimeType.split("/")[1]?.toUpperCase() ?? latestProof.mimeType} ·{" "}
              {formatBytes(latestProof.sizeBytes)}
            </p>
          </div>
        </div>
      </div>

      {/* WhatsApp support deeplink */}
      <a
        href={whatsAppHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-[4px] border-2 border-[#03C03C] text-[#018A29] font-semibold text-sm transition-colors duration-150 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-[#03C03C] focus:ring-offset-2"
      >
        <MessageCircle size={20} aria-hidden />
        Message us if you have questions
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local helper — read-only chip (no copy button)
// ---------------------------------------------------------------------------

function ReadOnlyChip({
  label,
  value,
  mono = false,
  large = false,
  green = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  large?: boolean;
  green?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[4px] border-2 border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 leading-tight">{label}</p>
        <p
          className={[
            "leading-tight mt-0.5 font-semibold break-all",
            mono ? "font-mono text-[18px]" : "text-sm",
            large ? "font-[var(--font-heading)] text-[24px]" : "",
            green ? "text-green-700" : "text-[#0B1020]",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
