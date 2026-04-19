"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, MessageSquarePlus } from "lucide-react";
import { ReviewSubmitForm } from "@/components/orders/review-submit-form";
import { BRAND } from "@/lib/brand";

/**
 * Per-item Review CTA on /orders/[id]. Three states:
 *   - alreadyReviewed=true  -> "You've reviewed this product." + PDP link
 *   - submitted (local)     -> "Thanks! Pending moderation." banner
 *   - default               -> "Review this item" button toggles inline form
 */
export function ReviewCTA({
  productId,
  productSlug,
  productName,
  alreadyReviewed,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  alreadyReviewed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (alreadyReviewed) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        <span>You&apos;ve reviewed this product.</span>
        <Link
          href={`/products/${productSlug}`}
          className="underline ml-1"
          style={{ color: BRAND.ink }}
        >
          View on store
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        role="status"
        className="rounded-xl px-3 py-2 text-sm"
        style={{ backgroundColor: `${BRAND.green}30`, color: BRAND.ink }}
      >
        Thanks! Your review is pending moderation.
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 min-h-[48px] px-4 rounded-lg font-bold text-sm border-2"
        style={{ borderColor: BRAND.ink, color: BRAND.ink }}
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden />
        {open ? "Cancel" : "Review this item"}
      </button>
      {open ? (
        <div
          className="mt-3 p-4 rounded-2xl"
          style={{ backgroundColor: `${BRAND.green}10` }}
        >
          <ReviewSubmitForm
            productId={productId}
            productName={productName}
            onSubmitted={() => {
              setSubmitted(true);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
