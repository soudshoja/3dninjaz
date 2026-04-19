import { Star } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Compact average-rating + review-count badge. Renders nothing when there
 * are zero approved reviews — the PDP shows a "No reviews yet" placeholder
 * in the ProductReviews section instead.
 */
export function RatingBadge({
  avg,
  count,
  size = "md",
}: {
  avg: number;
  count: number;
  size?: "sm" | "md";
}) {
  if (count === 0) return null;
  const px = size === "sm" ? "text-sm" : "text-base";
  return (
    <span
      className={`inline-flex items-center gap-1 ${px}`}
      aria-label={`Average rating ${avg.toFixed(1)} out of 5, based on ${count} review${count === 1 ? "" : "s"}`}
    >
      <Star
        className="h-4 w-4"
        fill={BRAND.green}
        stroke={BRAND.green}
        aria-hidden
      />
      <strong>{avg.toFixed(1)}</strong>
      <span className="text-slate-600">({count})</span>
    </span>
  );
}
