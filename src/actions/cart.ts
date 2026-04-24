"use server";

/**
 * Phase 16 — Cart hydration server action.
 *
 * The cart store only persists { variantId, quantity }. This action fetches
 * display-ready data from the DB for rendering in the drawer / /bag page.
 *
 * Returns HydratedCartItem[] — items that no longer exist in DB are omitted
 * (the caller should remove them from the store).
 */

import { db } from "@/lib/db";
import {
  productVariants,
  products,
  productOptionValues,
} from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { composeVariantLabel } from "@/lib/variants";

export type HydratedCartItem = {
  variantId: string;
  quantity: number;
  productId: string;
  productSlug: string;
  productName: string;
  productImage: string | null;
  variantLabel: string;
  unitPrice: string;
  inStock: boolean;
  available: boolean;
};

function ensureImagesArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    } catch {
      return [];
    }
  }
  return [];
}

export async function hydrateCartItems(
  items: { variantId: string; quantity: number }[],
): Promise<HydratedCartItem[]> {
  if (items.length === 0) return [];

  const variantIds = items.map((i) => i.variantId);

  // Fetch variants
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds));

  if (variantRows.length === 0) return [];

  // Fetch products
  const productIds = [...new Set(variantRows.map((v) => v.productId))];
  const productRows = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));

  const productById = new Map(productRows.map((p) => [p.id, p]));

  // Fetch option values for label composition
  const optionValueIds = [
    ...new Set(
      variantRows.flatMap((v) =>
        [v.option1ValueId, v.option2ValueId, v.option3ValueId].filter(
          (id): id is string => typeof id === "string",
        ),
      ),
    ),
  ];
  const valueRows =
    optionValueIds.length > 0
      ? await db
          .select()
          .from(productOptionValues)
          .where(inArray(productOptionValues.id, optionValueIds))
      : [];
  const valueById = new Map(valueRows.map((v) => [v.id, v]));

  // Build result — preserve input order
  return items.flatMap(({ variantId, quantity }) => {
    const v = variantRows.find((r) => r.id === variantId);
    if (!v) return []; // variant deleted — omit from cart

    const product = productById.get(v.productId);
    if (!product || !product.isActive) return []; // product inactive

    // Compose label
    const labelParts: string[] = [];
    for (const vid of [v.option1ValueId, v.option2ValueId, v.option3ValueId]) {
      if (vid) {
        const val = valueById.get(vid);
        if (val) labelParts.push(val.value);
      }
    }
    const variantLabel =
      labelParts.length > 0
        ? composeVariantLabel(labelParts)
        : (v.labelCache ?? "");

    // Determine availability
    const trackedOOS = v.trackStock === true && (v.stock ?? 0) <= 0;
    const legacyOOS = v.trackStock !== true && v.inStock === false;
    const available = !trackedOOS && !legacyOOS;

    const images = ensureImagesArray(product.images);
    const productImage =
      v.imageUrl ?? (images.length > 0 ? images[product.thumbnailIndex ?? 0] ?? images[0] ?? null : null);

    return [
      {
        variantId,
        quantity,
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        productImage,
        variantLabel,
        unitPrice: v.price,
        inStock: v.inStock ?? true,
        available,
      },
    ];
  });
}
