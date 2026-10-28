"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { markBalancePaid } from "@/actions/admin-order-edit";

/**
 * Settle the outstanding balance on an order (after items were added to an
 * already-paid order and the customer paid the difference). Sets amountPaid =
 * totalAmount. Confirms first.
 */
export function MarkBalancePaidButton({
  orderId,
  amount,
}: {
  orderId: string;
  /** Balance being settled, e.g. "24.50" - shown in the confirm prompt. */
  amount?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const markPaid = () => {
    if (
      !confirm(
        `Mark ${amount ? `RM ${amount}` : "the outstanding balance"} as received / PAID?\n\nUse this once the customer has paid the difference for the items you added.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await markBalancePaid(orderId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={markPaid}
        className="rounded-full px-4 py-2 text-sm font-semibold min-h-[44px] text-white disabled:opacity-50"
        style={{ backgroundColor: BRAND.greenDark }}
      >
        {pending ? "Saving…" : "Mark balance as paid"}
      </button>
      {error ? <p className="text-xs text-red-700 mt-1">{error}</p> : null}
    </>
  );
}
