import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { GiftCard } from "./gift-card";
import type { GiftItem } from "./gift-item";
import { HowItsMade } from "./how-its-made";
import { PrintFarmStage } from "./print-farm-stage";
import { RevealGroup } from "./reveal-group";
import styles from "./christmas-v2.module.css";

/**
 * /christmas, variant 2 "Print farm". The body of the page, without nav or
 * footer, so the store route and the preview route can share it.
 *
 * Production wiring (src/app/(store)/christmas/page.tsx):
 *   const { products } = await getActiveProductsByCategorySlug(CHRISTMAS_CATEGORY_SLUG);
 *   return <ChristmasPageV2 products={products.map(toGiftItem)} />;
 * and keep the page's existing metadata export.
 */
export function ChristmasPageV2({ products }: { products: GiftItem[] }) {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="xmas2-heading">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy} data-hero-copy>
            <h1
              id="xmas2-heading"
              className={`${styles.headline} ${styles.rise}`}
              style={{ "--i": 0 } as React.CSSProperties}
            >
              A very ninja Christmas.
            </h1>
            <p className={`${styles.lede} ${styles.rise}`} style={{ "--i": 1 } as React.CSSProperties}>
              Cool designs made by kids for kids. Pick one for everyone on your Christmas list.
            </p>
            <div className={`${styles.ctaRow} ${styles.rise}`} style={{ "--i": 2 } as React.CSSProperties}>
              <a href="#christmas-gifts" className={styles.cta}>
                See Christmas gifts
                <ArrowDown size={20} strokeWidth={1.75} aria-hidden="true" />
              </a>
              <Link href="/shop" className={styles.ctaGhost}>
                Shop everything
              </Link>
            </div>
          </div>

          <PrintFarmStage />
        </div>
        <div className={styles.heroScrim} aria-hidden="true" />
      </section>

      <HowItsMade />

      <section id="christmas-gifts" className={styles.gifts} aria-labelledby="xmas2-gifts-heading">
        <div className={styles.giftsInner}>
          <h2 id="xmas2-gifts-heading" className={styles.sectionTitle}>
            Christmas gifts
          </h2>

          {products.length > 0 ? (
            <RevealGroup as="ul" className={styles.grid}>
              {products.map((item, i) => (
                <li
                  key={item.id}
                  className={styles.rev}
                  style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
                >
                  <GiftCard item={item} index={i} featured={i === 0} />
                </li>
              ))}
            </RevealGroup>
          ) : (
            <div className={styles.empty}>
              <p>Our Christmas gifts are still printing. Browse the full shop in the meantime.</p>
              <Link href="/shop" className={styles.textLink}>
                Go to the shop
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
