import Link from "next/link";
import { listMyWishlist } from "@/actions/wishlist";
import { WishlistButton } from "@/components/store/wishlist-button";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

/**
 * /account/wishlist — list of wishlisted products (CUST-04).
 * Empty state offers a Browse the shop CTA. Each card shows product image,
 * name, price-from, a Save/Saved heart pill, and a View & add to bag CTA
 * pointing to the PDP (size selection still happens there per D2-02 UX).
 */
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const items = await listMyWishlist();

  if (items.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center bg-white">
        <p className="text-slate-600 mb-4">Your wishlist is empty.</p>
        <Link
          href="/shop"
          className="inline-flex items-center justify-center min-h-[60px] px-6 rounded-lg font-bold"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map(({ product, variants, wishlistId }) => {
        const sortedPrices = [...variants]
          .map((v) => parseFloat(v.price))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);
        const priceLabel =
          sortedPrices.length > 0 ? `From ${formatMYR(sortedPrices[0])}` : "—";
        const img = product.images[0] ?? null;
        return (
          <article
            key={wishlistId}
            className="flex gap-4 p-4 rounded-2xl bg-white min-h-[120px]"
          >
            <Link href={`/products/${product.slug}`} className="shrink-0">
              <div
                className="h-20 w-20 md:h-24 md:w-24 rounded-xl overflow-hidden"
                style={{ backgroundColor: `${BRAND.blue}15` }}
              >
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- product may be deactivated; native img is more forgiving
                  <img
                    src={img}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link
                href={`/products/${product.slug}`}
                className="font-bold truncate block hover:underline"
              >
                {product.name}
              </Link>
              <p className="text-sm text-slate-600 mt-1">{priceLabel}</p>
              <div className="mt-3 flex gap-2 flex-wrap items-center">
                <WishlistButton
                  productId={product.id}
                  initialState={true}
                  variant="pill"
                />
                <Link
                  href={`/products/${product.slug}`}
                  className="inline-flex items-center justify-center min-h-[48px] px-4 rounded-lg font-bold text-sm shadow-[0_2px_0_rgba(11,16,32,0.12)]"
                  style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
                >
                  View &amp; add to bag
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
