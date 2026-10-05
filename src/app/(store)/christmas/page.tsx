import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/store/product-card";
import { ChristmasTree } from "@/components/store/christmas/christmas-tree";
import { FloatingElements } from "@/components/store/christmas/floating-elements";
import styles from "@/components/store/christmas/christmas.module.css";
import { getActiveProductsByCategorySlug } from "@/lib/catalog";
import { getWishlistedProductIds } from "@/actions/wishlist";
import { CHRISTMAS_CATEGORY_SLUG } from "@/lib/seasonal";

export const metadata: Metadata = {
  title: "Christmas",
  description:
    "Christmas gifts 3D printed in Malaysia by kids who love making things.",
};

// Product list is driven by the admin-managed "christmas" category.
export const dynamic = "force-dynamic";

export default async function ChristmasPage() {
  const { products } = await getActiveProductsByCategorySlug(
    CHRISTMAS_CATEGORY_SLUG,
  );
  const wishedIds = await getWishlistedProductIds(products.map((p) => p.id));

  return (
    <div>
      <div className={styles.page}>
        <FloatingElements />

        <section className={styles.hero} aria-labelledby="xmas-heading">
          <div>
            <h1 id="xmas-heading" className={styles.headline}>
              A very <span className={styles.headlineRed}>ninja</span>{" "}
              Christmas.
            </h1>
            <p className={styles.lede}>
              Gifts 3D printed in Malaysia by kids who love making things. Pick
              yours early so it reaches you in time for the 25th.
            </p>
            <div className={styles.ctaRow}>
              <a href="#christmas-gifts" className={styles.cta}>
                See Christmas gifts
              </a>
              <Link href="/shop" className={styles.ctaGhost}>
                Shop everything
              </Link>
            </div>
          </div>

          <div className={styles.treeStage}>
            <div className={styles.treeGlow} aria-hidden="true" />
            <ChristmasTree />
            <p className={styles.displayNote}>
              Our tree is a display piece and isn&rsquo;t for sale.
            </p>
          </div>
        </section>

        {/* Snow drift into the product shelf */}
        <svg
          className={styles.drift}
          viewBox="0 0 1440 56"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 56 L0 30 Q120 4 260 28 T540 26 T820 30 T1100 24 T1440 30 L1440 56 Z"
            fill="#f6fbff"
          />
        </svg>
      </div>

      <section
        id="christmas-gifts"
        className={styles.shelf}
        aria-labelledby="xmas-gifts-heading"
      >
        <div className={styles.shelfHead}>
          <h2 id="xmas-gifts-heading" className={styles.shelfTitle}>
            Christmas gifts
          </h2>
        </div>

        {products.length > 0 ? (
          <ul className={styles.grid}>
            {products.map((p, i) => (
              <li key={p.id}>
                <ProductCard
                  product={p}
                  accentIndex={i}
                  isWishlisted={wishedIds.has(p.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <p>
              Our Christmas gifts are still printing. Browse the full shop in
              the meantime.
            </p>
            <p className="mt-4">
              <Link
                href="/shop"
                className="font-bold underline underline-offset-4"
              >
                Go to the shop
              </Link>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
