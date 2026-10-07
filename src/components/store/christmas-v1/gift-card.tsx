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
import { ResponsiveProductImage } from "@/components/storefront/responsive-product-image";
import { ICON_STROKE } from "./icon-stroke";
import type { GiftIcon, GiftItem } from "./gift-types";
import styles from "./christmas-v1.module.css";

const ICONS: Record<GiftIcon, LucideIcon> = {
  gift: Gift,
  snowflake: Snowflake,
  tree: TreePine,
  key: KeyRound,
  lamp: Lamp,
  box: Box,
};

/**
 * Dark gift card. A single link (name + price are the accessible name).
 * Server component: ResponsiveProductImage reads the image manifest on the
 * server. The wishlist heart from ProductCard is not carried over yet.
 */
export function GiftCard({
  item,
  featured = false,
}: {
  item: GiftItem;
  featured?: boolean;
}) {
  const Icon = ICONS[item.placeholderIcon ?? "gift"];
  return (
    <Link
      href={item.href}
      className={`${styles.card} ${featured ? styles.cardFeatured : ""}`}
      aria-label={`${item.name}, ${item.priceLabel}`}
    >
      <div className={`${styles.media} ${item.soldOut ? styles.mediaSoldOut : ""}`}>
        {item.imageUrl ? (
          <ResponsiveProductImage
            imageUrl={item.imageUrl}
            alt=""
            sizes="(max-width: 900px) 50vw, 33vw"
            className={styles.mediaImg}
          />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            <Icon size={featured ? 64 : 44} strokeWidth={ICON_STROKE} />
            {item.placeholderNote ? (
              <span className={styles.placeholderNote}>{item.placeholderNote}</span>
            ) : null}
          </div>
        )}
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>{item.name}</h3>
        <p className={`${styles.cardPrice} ${item.soldOut ? styles.cardPriceSoldOut : ""}`}>
          {item.soldOut ? "Sold out" : item.priceLabel}
        </p>
      </div>
    </Link>
  );
}
