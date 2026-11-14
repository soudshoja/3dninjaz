import "server-only";
// Loads every product with the fields the cost screens need. Admin-only data:
// callers MUST be behind requireAdmin() (pages are gated by the admin layout,
// actions call requireAdmin() first). Manual multi-query hydration (no LATERAL).

import { desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, productVariants, products } from "@/lib/db/schema";
import { ensureImagesV2, ensureTiers } from "@/lib/config-fields";
import {
  costToNumber,
  formatRm,
  representativePrice,
} from "@/lib/product-cost-math";
import type { ProductCostRow } from "@/lib/product-cost-types";

function priceLabel(
  type: string,
  variantPrices: number[],
  tiers: Record<string, number> | null,
): string {
  const values =
    type === "stocked" ? variantPrices : Object.values(tiers ?? {});
  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return "No price";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? formatRm(min) : `${formatRm(min)} to ${formatRm(max)}`;
}

export async function loadProductCostRows(): Promise<ProductCostRow[]> {
  const list = await db
    .select({
      id: products.id,
      name: products.name,
      productType: products.productType,
      categoryId: products.categoryId,
      isActive: products.isActive,
      isFeatured: products.isFeatured,
      images: products.images,
      thumbnailIndex: products.thumbnailIndex,
      priceTiers: products.priceTiers,
      costPrice: products.costPrice,
      costPerExtraUnit: products.costPerExtraUnit,
      costUpdatedAt: products.costUpdatedAt,
    })
    .from(products)
    .orderBy(desc(products.createdAt));
  if (list.length === 0) return [];

  const ids = list.map((p) => p.id);
  const variantRows = await db
    .select({ productId: productVariants.productId, price: productVariants.price })
    .from(productVariants)
    .where(inArray(productVariants.productId, ids));
  const pricesByProduct = new Map<string, number[]>();
  for (const v of variantRows) {
    const n = Number(v.price);
    if (!Number.isFinite(n)) continue;
    const bucket = pricesByProduct.get(v.productId) ?? [];
    bucket.push(n);
    pricesByProduct.set(v.productId, bucket);
  }

  const categoryIds = [
    ...new Set(list.map((p) => p.categoryId).filter((v): v is string => !!v)),
  ];
  const categoryRows =
    categoryIds.length > 0
      ? await db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(inArray(categories.id, categoryIds))
      : [];
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  return list.map((p) => {
    const type = (p.productType ?? "stocked") as string;
    const tiers = type === "stocked" ? null : ensureTiers(p.priceTiers);
    const variantPrices = pricesByProduct.get(p.id) ?? [];
    const imgs = ensureImagesV2(p.images).map((e) => e.url);
    const idx = typeof p.thumbnailIndex === "number" ? p.thumbnailIndex : 0;
    return {
      id: p.id,
      name: p.name,
      productType: type,
      categoryId: p.categoryId ?? null,
      categoryName: p.categoryId ? categoryName.get(p.categoryId) ?? null : null,
      isActive: !!p.isActive,
      isFeatured: !!p.isFeatured,
      thumbUrl: imgs[idx] ?? imgs[0] ?? null,
      price: representativePrice({ productType: type, variantPrices, priceTiers: tiers }),
      priceLabel: priceLabel(type, variantPrices, tiers),
      tiers: tiers && Object.keys(tiers).length > 0 ? tiers : null,
      cost: costToNumber(p.costPrice),
      costPerExtra: costToNumber(p.costPerExtraUnit),
      costUpdatedAt: p.costUpdatedAt ? p.costUpdatedAt.toISOString() : null,
    };
  });
}
