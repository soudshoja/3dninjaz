import { ReviewCTA } from "@/components/orders/review-cta";
import { getReviewedProductIds } from "@/actions/reviews";
import { BRAND } from "@/lib/brand";

type ReviewableItem = {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  size: string | null;
  variantLabel?: string | null;
};

const QUALIFYING_STATUSES = new Set([
  "paid",
  "processing",
  "shipped",
  "delivered",
]);

/**
 * Phase 6 06-05 — server component that renders the per-item review CTA on
 * /orders/[id]. Visible only when the order is in a buyer-qualifying status.
 * Pre-fetches the user's reviewed product ids in one batch query (no N+1).
 */
export async function ReviewsSection({
  status,
  items,
}: {
  status: string;
  items: ReviewableItem[];
}) {
  if (!QUALIFYING_STATUSES.has(status)) return null;
  if (items.length === 0) return null;

  const reviewedSet = await getReviewedProductIds(items.map((i) => i.productId));

  return (
    <section
      aria-labelledby="review"
      className="rounded-2xl p-4 md:p-6 mb-6"
      style={{ backgroundColor: "#ffffff" }}
    >
      <h2
        id="review"
        className="font-[var(--font-heading)] text-xl mb-4"
        style={{ color: BRAND.ink }}
      >
        Review your items
      </h2>
      <ul className="grid gap-4">
        {items.map((i) => (
          <li
            key={i.id}
            className="grid gap-3 pb-4 border-b border-black/5 last:border-b-0 last:pb-0"
          >
            <p className="font-semibold">
              {i.productName}{" "}
              <span className="text-sm text-slate-600 font-normal">
                {i.variantLabel
                  ? `· ${i.variantLabel}`
                  : i.size
                    ? `· Size ${i.size}`
                    : null}
              </span>
            </p>
            <ReviewCTA
              productId={i.productId}
              productSlug={i.productSlug}
              productName={i.productName}
              alreadyReviewed={reviewedSet.has(i.productId)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
