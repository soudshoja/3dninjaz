import Link from "next/link";
import { Bell, Gift, Package, Snowflake, Star, TreePine, type LucideIcon } from "lucide-react";
import { ResponsiveProductImage } from "@/components/storefront/responsive-product-image";
import type { GiftItem } from "./gift-item";
import styles from "./christmas-v2.module.css";

/**
 * Dark gift card for the Christmas page.
 *
 * TODO: swap for the shared ProductCard once it has a dark variant. The store
 * ProductCard is a white card with blue/green/purple accents and a wishlist
 * button, which breaks this page's single dark theme and single accent.
 * Wishlist is left out here on purpose; wire it when the shared card is reused.
 */

// Shown on the tile while a product has no photo yet.
const PLACEHOLDER_ICONS: LucideIcon[] = [Gift, TreePine, Star, Snowflake, Bell, Package];

export async function GiftCard({
  item,
  index,
  featured = false,
}: {
  item: GiftItem;
  index: number;
  featured?: boolean;
}) {
  const Icon = PLACEHOLDER_ICONS[index % PLACEHOLDER_ICONS.length];

  return (
    <Link
      href={`/products/${item.slug}`}
      className={styles.card}
      data-featured={featured}
      aria-label={`${item.name}, ${item.priceLabel}`}
    >
      <div className={styles.cardMedia}>
        {item.imageUrl ? (
          <ResponsiveProductImage
            imageUrl={item.imageUrl}
            alt=""
            sizes={featured ? "(max-width: 1024px) 100vw, 60vw" : "(max-width: 640px) 50vw, 30vw"}
            className={styles.cardImage}
          />
        ) : (
          <div className={styles.cardPlaceholder} aria-hidden="true">
            <Icon size={featured ? 72 : 40} strokeWidth={1.75} />
          </div>
        )}
        {item.isFeatured ? <span className={styles.cardTag}>Featured</span> : null}
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>{item.name}</h3>
        <p className={styles.cardPrice}>{item.priceLabel}</p>
      </div>
    </Link>
  );
}
