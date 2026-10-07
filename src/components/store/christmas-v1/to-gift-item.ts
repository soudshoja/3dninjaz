import { pickThumbnail, type CatalogProduct } from "@/lib/catalog";
import { formatFromTier, priceRangeMYR } from "@/lib/format";
import { isVariantAvailable } from "@/lib/variant-availability";
import type { GiftItem } from "./gift-types";

/**
 * Production adapter: CatalogProduct -> GiftItem. Price wording mirrors
 * ProductCard (tiered types say "From RM x", stocked products say
 * "from <range>", sold out says "Sold out"). Not imported by the preview.
 */
export function toGiftItem(product: CatalogProduct): GiftItem {
  const hydrated = product.hydratedVariants ?? [];
  const available = hydrated.filter(isVariantAvailable);
  const soldOut =
    product.productType === "stocked" &&
    hydrated.length > 0 &&
    available.length === 0;

  const tiered =
    product.productType === "configurable" ||
    product.productType === "keychain" ||
    product.productType === "vending" ||
    product.productType === "simple";

  let priceLabel: string;
  if (tiered) priceLabel = formatFromTier(product.priceTiers);
  else if (soldOut) priceLabel = "Sold out";
  else if (hydrated.length === 0) priceLabel = `from ${priceRangeMYR(product.variants)}`;
  else priceLabel = `from ${priceRangeMYR(available)}`;

  return {
    id: product.id,
    name: product.name,
    href: `/products/${product.slug}`,
    priceLabel,
    soldOut,
    imageUrl: pickThumbnail(product),
    placeholderIcon: "gift",
    placeholderNote: "No photo yet",
  };
}
