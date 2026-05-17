"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Wallet, Landmark, Check } from "lucide-react";
import { PaymentLinkIsland } from "@/components/payment-link/payment-link-island";
import { BankTransferCard } from "@/components/payment-link/bank-transfer-card";
import type { PaymentLinkProof } from "@/actions/payment-links";

type MethodId = "paypal" | "bank_transfer";

interface Props {
  token: string;
  clientId: string;
  currency: string;
  bankSettingsComplete: boolean;
  bankSettings: {
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolder: string;
  } | null;
  orderTotal: string;
  orderId: string;
  latestProof: PaymentLinkProof | null;
  orderStatus: string;
  /** Auto-expand bank transfer card (used after rejection). */
  autoExpandBankTransfer?: boolean;
}

/**
 * Phase 20 (20-08) — Two-card method picker (PayPal | Bank Transfer).
 *
 * D-14: Two cards side-by-side on ≥768px, stacked on <768px.
 * D-16: Bank Transfer card NOT rendered when bankSettingsComplete is false.
 * UI-SPEC: 60px collapsed card, 250ms height transition, sharp 4px corners,
 *          colour-shift hover only (no scale — memory feedback_zindex_click_intercept).
 */
export function PaymentMethodPicker({
  token,
  clientId,
  currency,
  bankSettingsComplete,
  bankSettings,
  orderTotal,
  orderId,
  autoExpandBankTransfer = false,
}: Props) {
  // If bank settings are not complete, default to PayPal only.
  // If auto-expanding bank transfer (after rejection), default to bank_transfer.
  const defaultMethod: MethodId | null =
    !bankSettingsComplete
      ? "paypal"
      : autoExpandBankTransfer
        ? "bank_transfer"
        : null;

  const [selected, setSelected] = useState<MethodId | null>(defaultMethod);

  function toggle(method: MethodId) {
    setSelected((prev) => (prev === method ? method : method));
    setSelected(method);
  }

  const paypalActive = selected === "paypal";
  const bankActive = selected === "bank_transfer";

  return (
    <div className="space-y-4">
      <h2 className="font-[var(--font-heading)] text-[18px] font-semibold">
        Choose payment method
      </h2>

      {/* Cards container — side-by-side ≥768px, stacked below */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* PayPal card */}
        <div
          className={
            "flex-1 rounded-[4px] border-2 overflow-hidden transition-colors duration-150 " +
            (paypalActive
              ? "border-[#0080ff]"
              : "border-slate-200 hover:border-slate-300")
          }
          style={{ backgroundColor: "#fff" }}
        >
          {/* Collapsed header — always visible */}
          <button
            type="button"
            aria-label="Pay with PayPal"
            aria-expanded={paypalActive}
            onClick={() => toggle("paypal")}
            className="relative w-full flex items-center gap-3 px-4 min-h-[60px] text-left focus:outline-none focus:ring-2 focus:ring-[#0080ff] focus:ring-offset-2"
          >
            <Wallet
              size={24}
              aria-hidden
              className={paypalActive ? "text-[#0080ff]" : "text-slate-500"}
            />
            <div className="flex-1 min-w-0">
              <p
                className={
                  "font-semibold text-sm leading-tight " +
                  (paypalActive ? "text-[#0080ff]" : "text-[#0B1020]")
                }
              >
                PayPal
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                Pay securely with your PayPal account
              </p>
            </div>
            {/* Active checkmark badge */}
            {paypalActive ? (
              <span
                className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-[#0080ff]"
                aria-hidden
              >
                <Check size={12} className="text-white" />
              </span>
            ) : (
              <ChevronDown
                size={18}
                className="flex-shrink-0 text-slate-400"
                aria-hidden
              />
            )}
          </button>

          {/* Expanded body */}
          <div
            className={
              "overflow-hidden transition-all duration-[250ms] " +
              (paypalActive ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0")
            }
            style={{ willChange: "max-height" }}
          >
            <div className="px-4 pb-4 border-t border-slate-100 pt-3">
              <PaymentLinkIsland
                token={token}
                clientId={clientId}
                currency={currency}
              />
            </div>
          </div>
        </div>

        {/* Bank Transfer card — D-16: only rendered when bankSettingsComplete */}
        {bankSettingsComplete && bankSettings ? (
          <div
            className={
              "flex-1 rounded-[4px] border-2 overflow-hidden transition-colors duration-150 " +
              (bankActive
                ? "border-[#8A00C2]"
                : "border-slate-200 hover:border-slate-300")
            }
            style={{ backgroundColor: "#fff" }}
          >
            {/* Collapsed header — always visible */}
            <button
              type="button"
              aria-label="Pay via bank transfer"
              aria-expanded={bankActive}
              onClick={() => toggle("bank_transfer")}
              className="relative w-full flex items-center gap-3 px-4 min-h-[60px] text-left focus:outline-none focus:ring-2 focus:ring-[#8A00C2] focus:ring-offset-2"
            >
              <Landmark
                size={24}
                aria-hidden
                className={bankActive ? "text-[#8A00C2]" : "text-slate-500"}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={
                    "font-semibold text-sm leading-tight " +
                    (bankActive ? "text-[#8A00C2]" : "text-[#0B1020]")
                  }
                >
                  Bank Transfer
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                  Direct transfer + upload your receipt
                </p>
              </div>
              {/* Active checkmark badge */}
              {bankActive ? (
                <span
                  className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-[#8A00C2]"
                  aria-hidden
                >
                  <Check size={12} className="text-white" />
                </span>
              ) : (
                <ChevronDown
                  size={18}
                  className="flex-shrink-0 text-slate-400"
                  aria-hidden
                />
              )}
            </button>

            {/* Expanded body */}
            <div
              className={
                "overflow-hidden transition-all duration-[250ms] " +
                (bankActive
                  ? "max-h-[1200px] opacity-100"
                  : "max-h-0 opacity-0")
              }
              style={{ willChange: "max-height" }}
            >
              <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                <BankTransferCard
                  token={token}
                  orderId={orderId}
                  orderTotal={orderTotal}
                  bankSettings={bankSettings}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* prefers-reduced-motion: disable height transitions via CSS */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          [style*="willChange"] {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
