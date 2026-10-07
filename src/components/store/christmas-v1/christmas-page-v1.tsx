import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { ChristmasTreeStage } from "./christmas-tree-stage";
import { GiftCard } from "./gift-card";
import { ICON_STROKE } from "./icon-stroke";
import { SnowField } from "./snow-field";
import type { GiftItem } from "./gift-types";
import styles from "./christmas-v1.module.css";

/**
 * /christmas, variant 1 "Night shift". Server component; the tree and the
 * snow are the only client leaves.
 *
 * Production wiring: pass `products.map(toGiftItem)` from
 * getActiveProductsByCategorySlug("christmas"), and `navOffset` = the store
 * nav height (e.g. "4.5rem") so the hero still fits the first screen.
 */
export function ChristmasPageV1({
  products,
  navOffset = "0px",
}: {
  products: GiftItem[];
  navOffset?: string;
}) {
  // The featured (2x2) first card only fills the 3-column grid cleanly when
  // the count is a multiple of three.
  const featured = products.length >= 6 && products.length % 3 === 0;

  return (
    <div
      className={styles.page}
      style={{ "--xmas-nav-h": navOffset } as CSSProperties}
    >
      <section className={styles.hero} aria-labelledby="xmas-heading">
        <SnowField className={styles.snow} />

        <div className={styles.heroInner}>
          <div>
            <h1
              id="xmas-heading"
              className={`${styles.headline} ${styles.enter}`}
              style={{ "--i": 0 } as CSSProperties}
            >
              A very ninja Christmas.
            </h1>
            <p
              className={`${styles.lede} ${styles.enter}`}
              style={{ "--i": 1 } as CSSProperties}
            >
              Cool designs by kids, for kids. Made to order in Kuala Lumpur and
              shipped across Malaysia.
            </p>
            <div
              className={`${styles.ctaRow} ${styles.enter}`}
              style={{ "--i": 2 } as CSSProperties}
            >
              <a href="#christmas-gifts" className={`${styles.btn} ${styles.btnPrimary}`}>
                See Christmas gifts
                <ArrowDown
                  className={styles.btnIcon}
                  size={20}
                  strokeWidth={ICON_STROKE}
                  aria-hidden="true"
                />
              </a>
              <Link href="/shop" className={`${styles.btn} ${styles.btnGhost}`}>
                Shop everything
              </Link>
            </div>
          </div>

          <div
            className={`${styles.treeStage} ${styles.enter}`}
            style={{ "--i": 3 } as CSSProperties}
          >
            <div className={styles.treeGlow} aria-hidden="true" />
            <ChristmasTreeStage />
            <p className={styles.displayNote}>
              Our tree is a display piece and isn&rsquo;t for sale.
            </p>
          </div>
        </div>
      </section>

      <section
        id="christmas-gifts"
        className={styles.shelf}
        aria-labelledby="xmas-gifts-heading"
      >
        <div className={styles.shelfHead}>
          <h2 id="xmas-gifts-heading" className={styles.shelfTitle}>
            Christmas gifts
          </h2>
          <p className={styles.shelfSub}>
            Each gift is printed when you order it.
          </p>
        </div>

        {products.length > 0 ? (
          <ul role="list" className={`${styles.grid} ${featured ? styles.gridFeatured : ""}`}>
            {products.map((item, i) => (
              <li key={item.id} className={styles.cell}>
                <GiftCard item={item} featured={featured && i === 0} />
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <p>
              Our Christmas gifts are still printing. Browse the full shop in
              the meantime.
            </p>
            <Link href="/shop" className={`${styles.btn} ${styles.btnPrimary}`}>
              Browse the shop
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
