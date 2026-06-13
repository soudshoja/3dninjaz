"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { convertDraftToOrder } from "@/actions/checkout-drafts";

/**
 * Convert an open checkout draft into a real (unpaid) order, then jump to the
 * new order's admin page. Confirms first — it creates an order row.
 */
export function DraftConvertButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const convert = () => {
    if (
      !confirm(
        "Convert this checkout draft into an order?\n\nCreates a new PENDING (unpaid) order with the customer's details and items, ready for you to chase payment. The draft is marked Converted.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await convertDraftToOrder(draftId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/admin/orders/${res.orderId}`);
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={convert}
        className="rounded-full px-4 py-2 text-sm font-semibold min-h-[44px] text-white disabled:opacity-50"
        style={{ backgroundColor: BRAND.ink }}
      >
        {pending ? "Converting…" : "Convert to order"}
      </button>
      {error ? (
        <p className="w-full text-xs text-red-700 mt-1">{error}</p>
      ) : null}
    </>
  );
}
