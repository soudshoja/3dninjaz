"use server";

/**
 * Phase 16 — Cart hydration server action.
 * Phase 19 (19-08) — Extended to handle ConfigurableCartItem lines.
 *
 * The cart store only persists { variantId, quantity } for stocked items, and
 * { productId, configurationData, quantity } for configurable items.
 * This action fetches display-ready data from the DB for rendering in the
 * drawer / /bag page.
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
import { isConfigurableCartItem } from "@/stores/cart-store";
import type { CartItem } from "@/stores/cart-store";
import type { ConfigurationData } from "@/lib/config-fields";

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
  // Phase 19 (19-08): discriminator + configuration payload
  productType: "stocked" | "configurable";
  configurationData?: ConfigurationData;
  /** Stable store key for increment/decrement/remove calls.
   *  Stocked: same as variantId. Configurable: `${productId}::${hash}`. */
  storeKey: string;
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
  items: CartItem[],
): Promise<HydratedCartItem[]> {
  if (items.length === 0) return [];

  // Partition into stocked and configurable lines
  const stockedItems = items.filter((i) => !isConfigurableCartItem(i)) as Array<{ key: string; variantId: string; quantity: number }>;
  const configurableItems = items.filter(isConfigurableCartItem);

  const results: HydratedCartItem[] = [];

  // ── Stocked lines ─────────────────────────────────────────────────────────
  if (stockedItems.length > 0) {
    const variantIds = stockedItems.map((i) => i.variantId);

    const variantRows = await db
      .select()
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds));

    const productIds = [...new Set(variantRows.map((v) => v.productId))];
    const productRows = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));

    const productById = new Map(productRows.map((p) => [p.id, p]));

    const optionValueIds = [
      ...new Set(
        variantRows.flatMap((v) =>
          [
            v.option1ValueId,
            v.option2ValueId,
            v.option3ValueId,
            v.option4ValueId,
            v.option5ValueId,
            v.option6ValueId,
          ].filter((id): id is string => typeof id === "string"),
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

    for (const { variantId, quantity } of stockedItems) {
      const v = variantRows.find((r) => r.id === variantId);
      if (!v) continue; // variant deleted — omit from cart

      const product = productById.get(v.productId);
      if (!product || !product.isActive) continue; // product inactive

      const labelParts: string[] = [];
      for (const vid of [
        v.option1ValueId,
        v.option2ValueId,
        v.option3ValueId,
        v.option4ValueId,
        v.option5ValueId,
        v.option6ValueId,
      ]) {
        if (vid) {
          const val = valueById.get(vid);
          if (val) labelParts.push(val.value);
        }
      }
      const variantLabel =
        labelParts.length > 0
          ? composeVariantLabel(labelParts)
          : (v.labelCache ?? "");

      const trackedOOS = v.trackStock === true && (v.stock ?? 0) <= 0;
      const allowPreorder = v.allowPreorder === true;
      const legacyOOS = v.trackStock !== true && v.inStock === false;
      const available = (!trackedOOS || allowPreorder) && !legacyOOS;

      const images = ensureImagesArray(product.images);
      const productImage =
        v.imageUrl ?? (images.length > 0 ? images[product.thumbnailIndex ?? 0] ?? images[0] ?? null : null);

      const now = new Date();
      const isOnSale =
        v.salePrice !== null &&
        (v.saleFrom === null || new Date(v.saleFrom) <= now) &&
        (v.saleTo === null || new Date(v.saleTo) >= now);
      const unitPrice = isOnSale && v.salePrice ? String(v.salePrice) : v.price;

      results.push({
        variantId,
        quantity,
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        productImage,
        variantLabel,
        unitPrice,
        inStock: v.inStock ?? true,
        available,
        productType: "stocked",
        storeKey: variantId,
      });
    }
  }

  // ── Configurable lines ────────────────────────────────────────────────────
  if (configurableItems.length > 0) {
    const productIds = [...new Set(configurableItems.map((i) => i.productId))];
    const productRows = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));
    const productById = new Map(productRows.map((p) => [p.id, p]));

    for (const item of configurableItems) {
      const row = productById.get(item.productId);
      if (!row) continue; // product deleted — omit

      const images = ensureImagesArray(row.images);
      const productImage = images.length > 0 ? images[row.thumbnailIndex ?? 0] ?? images[0] ?? null : null;

      results.push({
        variantId: "",        // empty — configurable has no variantId; consumers check productType
        quantity: item.quantity,
        productId: row.id,
        productSlug: row.slug,
        productName: row.name,
        productImage,
        variantLabel: item.configurationData.computedSummary,  // re-use existing line-2 slot
        unitPrice: item.configurationData.computedPrice.toFixed(2),
        inStock: true,        // configurable products are always "available" if isActive
        available: row.isActive,
        productType: "configurable",
        configurationData: item.configurationData,
        storeKey: item.key,   // `${productId}::${hash}` — used by CartLineRow qty controls
      });
    }
  }

  // Preserve original cart-line order (input items index)
  const resultByKey = new Map<string, HydratedCartItem>();
  // For stocked: keyed by variantId. For configurable: keyed by productId+summary combo.
  // We re-order by iterating items in original order.
  const stockedResultByVariantId = new Map(
    results.filter((r) => r.productType === "stocked").map((r) => [r.variantId, r])
  );
  const configurableResultByProductId = new Map<string, HydratedCartItem[]>();
  for (const r of results.filter((r) => r.productType === "configurable")) {
    const bucket = configurableResultByProductId.get(r.productId) ?? [];
    bucket.push(r);
    configurableResultByProductId.set(r.productId, bucket);
  }

  const ordered: HydratedCartItem[] = [];
  const usedConfigurableKeys = new Set<string>();

  for (const item of items) {
    if (isConfigurableCartItem(item)) {
      // Match by productId + computedSummary (unique per line)
      const bucket = configurableResultByProductId.get(item.productId) ?? [];
      const match = bucket.find(
        (r) => r.configurationData?.computedSummary === item.configurationData.computedSummary &&
               !usedConfigurableKeys.has(item.key),
      );
      if (match) {
        usedConfigurableKeys.add(item.key);
        ordered.push(match);
      }
    } else {
      const r = stockedResultByVariantId.get(item.variantId);
      if (r) ordered.push(r);
    }
  }

  // Fallback: if ordering logic missed any results, append them
  for (const r of results) {
    if (!ordered.includes(r)) ordered.push(r);
  }

  void resultByKey; // unused — ordering done above
  return ordered;
}
