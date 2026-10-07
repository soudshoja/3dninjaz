import Link from "next/link";
import {
  Box,
  Gift,
  KeyRound,
  Lamp,
  Snowflake,
  TreePine,
  type LucideIcon,
} from "lucide-react";
import type { GiftIcon, GiftItem } from "./gift-types";
import styles from "./christmas-v3.module.css";

/**
 * Local dark gift card. The shared ProductCard is a white card with
 * blue/green/purple accents and a wishlist button that needs auth, so it
 * would break the one-accent dark theme on this page.
 * TODO: swap for ProductCard (or restyle it) once the direction is chosen.
 */

const ICONS: Record<GiftIcon, LucideIcon> = {
  gift: Gift,
  snowflake: Snowflake,
  tree: TreePine,
  key: KeyRound,
  lamp: Lamp,
  box: Box,
};

export function GiftCard({ item }: { item: GiftItem }) {
  const Icon = ICONS[item.placeholderIcon ?? "gift"];

  return (
    <Link
      href={item.href}
      className={styles.cardLink}
      aria-label={`${item.name}, ${item.priceLabel}`}
    >
      <div className={styles.media}>
        {item.imageUrl ? (
          // TODO: swap for ResponsiveProductImage (avif/webp srcset) in production.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            width={800}
            height={800}
            loading="lazy"
            decoding="async"
            className={styles.mediaImg}
          />
        ) : (
          <div className={styles.ph} aria-hidden="true">
            <Icon size={44} strokeWidth={2} aria-hidden="true" />
            {item.placeholderNote ? (
              <span className={styles.phNote}>{item.placeholderNote}</span>
            ) : null}
          </div>
        )}
        {item.soldOut ? <span className={styles.badge}>Sold out</span> : null}
      </div>
      <div className={styles.meta}>
        <h3 className={styles.name}>{item.name}</h3>
        <p className={item.soldOut ? `${styles.price} ${styles.priceMuted}` : styles.price}>
          {item.priceLabel}
        </p>
      </div>
    </Link>
  );
}
