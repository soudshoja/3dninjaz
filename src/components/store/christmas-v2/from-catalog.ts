import { pickThumbnail, type CatalogProduct } from "@/lib/catalog";
import { formatFromTier, priceRangeMYR } from "@/lib/format";
import { isVariantAvailable } from "@/lib/variant-availability";
import type { GiftItem } from "./gift-item";

/**
 * Production wiring: map real catalog rows to the page's GiftItem. Mirrors the
 * price-label rules in the store ProductCard. Not imported by the preview route.
 *
 *   const { products } = await getActiveProductsByCategorySlug(CHRISTMAS_CATEGORY_SLUG);
 *   <ChristmasPageV2 products={products.map(toGiftItem)} />
 */
export function toGiftItem(product: CatalogProduct): GiftItem {
  const hydrated = product.hydratedVariants;
  const available = hydrated.filter(isVariantAvailable);
  const tiered =
    product.productType === "configurable" ||
    product.productType === "keychain" ||
    product.productType === "vending" ||
    product.productType === "simple";

  let priceLabel: string;
  if (tiered) priceLabel = formatFromTier(product.priceTiers);
  else if (hydrated.length === 0) priceLabel = `From ${priceRangeMYR(product.variants)}`;
  else if (available.length === 0) priceLabel = "Sold out";
  else priceLabel = `From ${priceRangeMYR(available)}`;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    priceLabel,
    imageUrl: pickThumbnail(product) ?? null,
    isFeatured: product.isFeatured,
  };
}
