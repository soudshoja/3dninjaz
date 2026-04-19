import Link from "next/link";
import { BRAND } from "@/lib/brand";
import type { AdminReviewRow as Row } from "@/actions/admin-reviews";
import { ReviewRowActions } from "./review-row-actions";

const STATUS_STYLES: Record<
  Row["status"],
  { label: string; bg: string; color: string }
> = {
  pending: { label: "Pending", bg: "#fef3c7", color: "#92400e" },
  approved: { label: "Approved", bg: "#dcfce7", color: "#166534" },
  hidden: { label: "Hidden", bg: "#e2e8f0", color: "#334155" },
};

function Stars({ rating }: { rating: number }) {
  const safe = Math.max(0, Math.min(5, rating));
  return (
    <span aria-label={`Rating ${safe} out of 5`} className="font-mono">
      {"★".repeat(safe)}
      <span className="opacity-30">{"★".repeat(5 - safe)}</span>
    </span>
  );
}

/**
 * Single <tr> for /admin/reviews. Body is rendered as a plain text node —
 * never as raw HTML — so even adversarial future submissions cannot inject
 * markup into the admin queue (T-05-07-XSS).
 */
export function ReviewRow({ review }: { review: Row }) {
  const statusStyle = STATUS_STYLES[review.status];
  return (
    <tr className="border-t border-black/10 align-top">
      <td className="p-3">
        {review.productSlug ? (
          <Link
            href={`/products/${review.productSlug}`}
            className="font-semibold underline decoration-dotted"
            style={{ color: BRAND.ink }}
          >
            {review.productName}
          </Link>
        ) : (
          <span className="font-semibold">{review.productName}</span>
        )}
      </td>
      <td className="p-3 text-xs">
        <p className="font-semibold">{review.userName}</p>
        <p className="text-slate-500 truncate max-w-[200px]">
          {review.userEmail}
        </p>
      </td>
      <td className="p-3 whitespace-nowrap text-yellow-500">
        <Stars rating={review.rating} />
      </td>
      <td
        className="p-3 text-sm max-w-[400px]"
        style={{ color: BRAND.ink }}
        title={review.body}
      >
        <p className="line-clamp-3">{review.body}</p>
      </td>
      <td className="p-3">
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold"
          style={{
            backgroundColor: statusStyle.bg,
            color: statusStyle.color,
          }}
        >
          {statusStyle.label}
        </span>
      </td>
      <td className="p-3 text-xs whitespace-nowrap">
        {new Date(review.createdAt).toLocaleDateString("en-MY")}
      </td>
      <td className="p-3">
        <ReviewRowActions row={{ id: review.id, status: review.status }} />
      </td>
    </tr>
  );
}
