"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  acceptClaimAction,
  escalateAction,
} from "@/actions/admin-disputes";

/**
 * Phase 7 (07-06) — dispute action bar.
 *
 * Two CTAs: Accept claim + Escalate to arbiter. Each opens a confirm
 * card with a required note input. Tap targets >= 48px (D-04 mobile).
 */
export function DisputeActionBar({
  disputeId,
  status,
  amount,
  currency,
}: {
  disputeId: string;
  status: string;
  amount: string | null;
  currency: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "accept" | "escalate">("none");
  const [note, setNote] = useState<string>("");

  const inputClass =
    "w-full min-h-[48px] rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]";

  function reset() {
    setMode("none");
    setNote("");
    setError(null);
  }

  function onAccept() {
    if (note.trim().length === 0) {
      setError("Note is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await acceptClaimAction(disputeId, {
        note: note.trim(),
        ...(amount && currency
          ? {
              refundAmount: {
                value: amount,
                currencyCode: currency,
              },
            }
          : {}),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      reset();
      router.refresh();
    });
  }

  function onEscalate() {
    if (note.trim().length === 0) {
      setError("Note is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await escalateAction(disputeId, { note: note.trim() });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      reset();
      router.refresh();
    });
  }

  const isClosed =
    status.toUpperCase() === "RESOLVED" ||
    status.toUpperCase() === "CANCELLED";

  if (isClosed) {
    return (
      <p className="text-sm text-slate-600">
        This dispute is closed; no further actions are available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => setMode("accept")}
            className="min-h-[48px]"
            variant="outline"
          >
            Accept claim
          </Button>
          <Button
            type="button"
            onClick={() => setMode("escalate")}
            className="min-h-[48px]"
            variant="outline"
          >
            Escalate to arbiter
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
          <h3 className="font-[var(--font-heading)] text-lg text-amber-900">
            {mode === "accept" ? "Accept claim" : "Escalate to PayPal arbiter"}
          </h3>
          <p className="text-sm text-amber-800">
            {mode === "accept"
              ? "PayPal will refund the buyer the dispute amount on your behalf. This is final."
              : "PayPal will take over the dispute as the arbiter. This is final."}
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">
              Note to PayPal *
            </label>
            <textarea
              className={inputClass + " min-h-[100px]"}
              rows={3}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              placeholder="Brief explanation for the audit trail..."
            />
          </div>
          <div className="flex flex-wrap gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              className="min-h-[48px]"
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={mode === "accept" ? onAccept : onEscalate}
              className="min-h-[60px] px-6"
              disabled={pending}
            >
              {pending
                ? "Submitting..."
                : mode === "accept"
                  ? "Confirm accept"
                  : "Confirm escalate"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
