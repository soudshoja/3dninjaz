"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { issueRefund } from "@/actions/admin-refunds";
import { formatMYR } from "@/lib/format";

/**
 * Phase 7 (07-05) — refund form with two-step confirm (Q-07-01 default).
 *
 * Flow:
 *   step='enter'      — admin enters amount + reason -> "Continue"
 *   step='confirm'    — modal-style card: re-type amount to confirm
 *   step='submitting' — spinner; UI disabled
 *   step='done'       — success card; auto-redirect after 2s
 *
 * All inputs >= 48px; primary button >= 60px (D-04 mobile).
 */
export function RefundForm({
  orderId,
  totalAmount,
  refundedAmount,
}: {
  orderId: string;
  totalAmount: string;
  refundedAmount: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"enter" | "confirm" | "done">("enter");
  const total = parseFloat(totalAmount);
  const already = parseFloat(refundedAmount);
  const remaining = Math.max(0, +(total - already).toFixed(2));
  const [amount, setAmount] = useState<string>(remaining.toFixed(2));
  const [reason, setReason] = useState<string>("");
  const [confirmTyped, setConfirmTyped] = useState<string>("");

  const inputClass =
    "w-full min-h-[48px] rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]";

  function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Amount must be greater than RM 0.00.");
      return;
    }
    if (num > remaining + 0.001) {
      setError(
        `Amount exceeds remaining (RM ${remaining.toFixed(2)}).`,
      );
      return;
    }
    if (reason.trim().length === 0) {
      setError("Reason is required.");
      return;
    }
    setConfirmTyped("");
    setStep("confirm");
  }

  function onCancel() {
    setStep("enter");
    setConfirmTyped("");
  }

  function onConfirmSubmit() {
    setError(null);
    startTransition(async () => {
      const r = await issueRefund({
        orderId,
        amount: parseFloat(amount),
        reason: reason.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        setStep("enter");
        return;
      }
      setStep("done");
      setTimeout(() => {
        router.push(`/admin/payments/${orderId}`);
        router.refresh();
      }, 1800);
    });
  }

  if (step === "done") {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-4">
        <p className="text-lg font-semibold text-green-900">
          Refund issued.
        </p>
        <p className="mt-1 text-sm text-green-800">
          Returning to payment detail...
        </p>
      </div>
    );
  }

  if (step === "confirm") {
    const amountNum = parseFloat(amount);
    const typed = parseFloat(confirmTyped);
    const matches = Math.abs(typed - amountNum) < 0.001;
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 md:p-6 space-y-4">
        <div>
          <h3 className="font-[var(--font-heading)] text-lg text-amber-900">
            Confirm refund
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            About to refund <strong>{formatMYR(amount)}</strong> to PayPal
            capture for reason:{" "}
            <em className="italic">"{reason.trim()}"</em>
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Type the amount again to confirm. This action is irreversible.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Re-type amount (RM)
          </label>
          <input
            className={inputClass + " font-mono"}
            inputMode="decimal"
            value={confirmTyped}
            onChange={(e) => setConfirmTyped(e.target.value)}
            disabled={pending}
            placeholder={amount}
          />
        </div>
        {error ? (
          <div
            className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
            className="min-h-[48px]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirmSubmit}
            disabled={!matches || pending}
            className="min-h-[60px] px-6"
          >
            {pending ? "Refunding..." : `Confirm refund of ${formatMYR(amount)}`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onContinue} className="space-y-4">
      {error ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1">
            Refund amount (RM)
          </label>
          <input
            className={inputClass + " font-mono"}
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-slate-500">
            Remaining refundable: {formatMYR(remaining.toFixed(2))} of{" "}
            {formatMYR(totalAmount)}.
          </p>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Reason (sent as note to customer; max 200 chars)
        </label>
        <textarea
          className={inputClass + " min-h-[100px]"}
          rows={3}
          maxLength={200}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          placeholder="e.g. Customer requested refund — wrong size shipped"
        />
        <p className="mt-1 text-xs text-slate-500">
          {reason.length} / 200
        </p>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          className="min-h-[60px] px-8"
          disabled={pending || remaining <= 0}
        >
          Continue to confirm
        </Button>
      </div>
    </form>
  );
}
