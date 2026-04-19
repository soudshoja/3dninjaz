import { Star } from "lucide-react";
import { listProductReviews } from "@/actions/reviews";
import { BRAND } from "@/lib/brand";

/**
 * PDP reviews section — renders up to 10 most-recent approved reviews.
 * Reviewer name shows "Former customer" when user.deletedAt is set
 * (T-06-05-PDPA). Body text is preserved with whitespace-pre-wrap so line
 * breaks survive without introducing HTML.
 */
export async function ProductReviews({ productId }: { productId: string }) {
  const { reviews, totalApproved } = await listProductReviews(productId, {
    limit: 10,
  });

  if (totalApproved === 0) {
    return (
      <section
        aria-labelledby="reviews"
        className="rounded-2xl p-5 md:p-6 bg-white"
      >
        <h2
          id="reviews"
          className="font-[var(--font-heading)] text-xl mb-3"
          style={{ color: BRAND.ink }}
        >
          Reviews
        </h2>
        <p className="text-slate-600">
          No reviews yet. Be the first to review this product after your order
          arrives.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="reviews"
      className="rounded-2xl p-5 md:p-6 bg-white"
    >
      <h2
        id="reviews"
        className="font-[var(--font-heading)] text-xl mb-3"
        style={{ color: BRAND.ink }}
      >
        Reviews ({totalApproved})
      </h2>
      <ul className="grid gap-4 divide-y divide-black/5">
        {reviews.map((r) => (
          <li key={r.id} className="pt-4 first:pt-0">
            <header className="flex items-center gap-3 flex-wrap mb-2">
              <div
                aria-label={`${r.rating} stars`}
                className="flex items-center gap-0.5"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className="h-4 w-4"
                    fill={n <= r.rating ? BRAND.green : "transparent"}
                    stroke={BRAND.green}
                    aria-hidden
                  />
                ))}
              </div>
              <span className="text-sm text-slate-600">{r.reviewerName}</span>
              <span className="text-sm text-slate-400 ml-auto">
                {new Date(r.createdAt).toLocaleDateString("en-MY")}
              </span>
            </header>
            <p className="whitespace-pre-wrap leading-relaxed">{r.body}</p>
          </li>
        ))}
      </ul>
      {totalApproved > reviews.length ? (
        <p className="text-sm text-slate-600 mt-4">
          Showing {reviews.length} of {totalApproved} reviews.
        </p>
      ) : null}
    </section>
  );
}
