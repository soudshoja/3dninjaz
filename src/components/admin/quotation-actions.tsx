"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  markQuotationSent,
  markQuotationDepositPaid,
  markQuotationPaidInFull,
  cancelQuotation,
  deleteQuotation,
} from "@/actions/admin-quotations";

/**
 * Lifecycle buttons on the quotation detail page.
 *
 * Marking a payment is what creates the order and triggers the existing
 * invoice, so both payment buttons confirm first — they are not undoable from
 * this screen.
 */
export function QuotationActions({
  id,
  status,
  depositLabel,
  totalLabel,
  hasItems,
}: {
  id: string;
  status: string;
  depositLabel: string;
  totalLabel: string;
  hasItems: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "That did not work.");
        return;
      }
      router.refresh();
    });
  }

  const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({
    minHeight: 48,
    backgroundColor: bg,
    color: fg,
  });
  const outline: React.CSSProperties = {
    minHeight: 48,
    border: `2px solid ${BRAND.ink}22`,
    color: BRAND.ink,
  };

  const isPaidStage = status === "deposit_paid" || status === "completed";

  return (
    <div className="space-y-3">
      {error ? (
        <div
          role="alert"
          className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <a
          href={`/admin/quotations/${id}/quotation.pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full px-5 text-sm font-bold"
          style={outline}
        >
          Open PDF
        </a>

        {status === "draft" ? (
          <button
            type="button"
            disabled={pending || !hasItems}
            onClick={() => run(() => markQuotationSent(id))}
            className="rounded-full px-5 text-sm font-bold disabled:opacity-60"
            style={btn(BRAND.ink)}
          >
            Mark as sent
          </button>
        ) : null}

        {!isPaidStage && status !== "cancelled" ? (
          <>
            <button
              type="button"
              disabled={pending || !hasItems}
              onClick={() =>
                run(
                  () => markQuotationDepositPaid(id),
                  `Record the ${depositLabel} deposit? This creates the order and sends the invoice showing the balance due.`,
                )
              }
              className="rounded-full px-5 text-sm font-bold disabled:opacity-60"
              style={btn(BRAND.blue)}
            >
              Deposit paid ({depositLabel})
            </button>
            <button
              type="button"
              disabled={pending || !hasItems}
              onClick={() =>
                run(
                  () => markQuotationPaidInFull(id),
                  `Record full payment of ${totalLabel}? This creates the order and sends the paid invoice.`,
                )
              }
              className="rounded-full px-5 text-sm font-bold disabled:opacity-60"
              style={btn(BRAND.green, BRAND.ink)}
            >
              Paid in full ({totalLabel})
            </button>
          </>
        ) : null}

        {status === "deposit_paid" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => markQuotationPaidInFull(id),
                "Record the balance as paid? This marks the order paid and sends the invoice.",
              )
            }
            className="rounded-full px-5 text-sm font-bold disabled:opacity-60"
            style={btn(BRAND.green, BRAND.ink)}
          >
            Balance paid
          </button>
        ) : null}

        {status === "draft" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => deleteQuotation(id), "Delete this draft quotation?")
            }
            className="rounded-full px-5 text-sm font-semibold disabled:opacity-60"
            style={outline}
          >
            Delete draft
          </button>
        ) : null}

        {!isPaidStage && status !== "cancelled" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => cancelQuotation(id), "Cancel this quotation?")
            }
            className="rounded-full px-5 text-sm font-semibold disabled:opacity-60"
            style={outline}
          >
            Cancel quote
          </button>
        ) : null}
      </div>
    </div>
  );
}
