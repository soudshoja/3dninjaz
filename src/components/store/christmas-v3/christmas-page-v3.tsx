import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { FlatTree } from "./flat-tree";
import { GiftCard } from "./gift-card";
import { PrintStage } from "./print-stage";
import { RevealGrid } from "./reveal-grid";
import type { GiftItem } from "./gift-types";
import styles from "./christmas-v3.module.css";

/**
 * /christmas, variant 3: "Scroll to print".
 *
 * Production wiring (when this direction is chosen):
 *   const { products } = await getActiveProductsByCategorySlug(CHRISTMAS_CATEGORY_SLUG);
 *   <ChristmasPageV3 products={products.map(toGiftItem)} />
 * and set `--xmas3-sticky-top` to the store nav height on an ancestor.
 *
 * `debugProgress` is a dev-only testing hook (see print-stage.tsx). Never pass
 * it from the real route.
 */

// No-JS: undo the tall sticky track so the page is a normal short page with
// the finished flat tree. Attribute selectors because module classes are hashed.
const NOSCRIPT_CSS = `
[data-xmas3-track]{height:auto !important}
[data-xmas3-stage]{position:relative !important;top:auto !important;height:auto !important;overflow:visible !important}
[data-xmas3-treebox]{width:min(100%,26rem) !important;height:auto !important;aspect-ratio:4/5 !important;--lit:1 !important}
[data-xmas3-flat]{opacity:1 !important;visibility:visible !important}
[data-xmas3-canvas],[data-xmas3-cue]{display:none !important}
`;

function HeroCopy() {
  return (
    <div className={styles.copy}>
      <h1 id="xmas3-heading" className={styles.headline}>
        A very ninja Christmas.
      </h1>
      <p className={styles.lede}>
        Cool designs made by kids for kids. Made to order in Kuala Lumpur, shipped across
        Malaysia.
      </p>
      <div className={styles.ctaRow}>
        <a href="#gifts" className={styles.cta}>
          See gifts
          <ArrowDown size={20} strokeWidth={2} aria-hidden="true" />
        </a>
        <Link href="/shop" className={styles.ctaGhost}>
          Shop everything
        </Link>
      </div>
    </div>
  );
}

export function ChristmasPageV3({
  products,
  debugProgress,
}: {
  products: GiftItem[];
  debugProgress?: number;
}) {
  // First card is featured (2x2 on desktop) once there are enough cards to balance it.
  const featured = products.length >= 4;
  const rest = featured ? products.length - 1 : products.length;
  const wideLast = rest % 2 === 1;

  return (
    <div className={styles.page}>
      <noscript>
        <style>{NOSCRIPT_CSS}</style>
      </noscript>

      <PrintStage copy={<HeroCopy />} flat={<FlatTree />} debugProgress={debugProgress} />

      <section id="gifts" className={styles.gifts} aria-labelledby="xmas3-gifts-heading">
        <div className={styles.giftsInner}>
          <div className={styles.giftsHead}>
            <h2 id="xmas3-gifts-heading" className={styles.giftsTitle}>
              Christmas gifts
            </h2>
            <Link href="/shop" className={styles.textLink}>
              Shop everything
              <ArrowRight
                className={styles.textLinkIcon}
                size={20}
                strokeWidth={2}
                aria-hidden="true"
              />
            </Link>
          </div>

          {products.length > 0 ? (
            <RevealGrid featured={featured} wideLast={wideLast}>
              {products.map((item, i) => (
                <li key={item.id} style={{ "--i": i % 6 } as React.CSSProperties}>
                  <GiftCard item={item} />
                </li>
              ))}
            </RevealGrid>
          ) : (
            <div className={styles.empty}>
              <p>Our Christmas gifts are still printing. Browse the full shop in the meantime.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
