"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { submitReview } from "@/actions/reviews";
import { BRAND } from "@/lib/brand";

/**
 * Inline review form for /orders/[id]. 1-5 star picker (button group with
 * aria-pressed) + textarea (10-2000 chars, char count hint). On success
 * onSubmitted() is called so the parent ReviewCTA flips to a thank-you banner.
 */
export function ReviewSubmitForm({
  productId,
  productName,
  onSubmitted,
}: {
  productId: string;
  productName: string;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rating < 1) {
      setError("Pick a star rating from 1 to 5.");
      return;
    }
    if (body.length < 10) {
      setError("Review must be at least 10 characters.");
      return;
    }
    startTransition(async () => {
      const res = await submitReview({ productId, rating, body });
      if (res.ok) {
        onSubmitted();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <fieldset>
        <legend className="text-sm font-semibold mb-2">
          Rate {productName}
        </legend>
        <div role="radiogroup" className="flex items-center gap-1 flex-wrap">
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= rating;
            return (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                aria-pressed={filled}
                onClick={() => setRating(n)}
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg"
              >
                <Star
                  className="h-7 w-7"
                  fill={filled ? BRAND.green : "transparent"}
                  stroke={BRAND.green}
                />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor={`review-body-${productId}`}
        >
          Your review
        </label>
        <textarea
          id={`review-body-${productId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          className="w-full rounded-xl border-2 px-4 py-3 min-h-[120px] focus:outline-none focus:ring-2 bg-white"
          style={{ borderColor: `${BRAND.ink}22` }}
          placeholder="Tell other buyers what you loved (or didn't)…"
          aria-describedby={`review-body-hint-${productId}`}
        />
        <p
          id={`review-body-hint-${productId}`}
          className="text-xs text-slate-600 mt-1"
        >
          {body.length} / 2000 characters · 10-2000 chars
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center min-h-[60px] px-6 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
        >
          {pending ? "Submitting…" : "Submit review"}
        </button>
        {error ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm"
            style={{ color: "#DC2626" }}
          >
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
