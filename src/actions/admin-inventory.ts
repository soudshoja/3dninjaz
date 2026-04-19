"use server";

import { db } from "@/lib/db";
import { productVariants, products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";

// ============================================================================
// Plan 05-04 admin inventory toggles.
//
// IMPORTANT (T-05-04-EoP):
//   requireAdmin() FIRST await in every export.
//
// IMPORTANT (T-05-04-tampering):
//   Storefront cart re-validates inStock at order create time
//   (createPayPalOrder). This action just persists the toggle state.
// ============================================================================

type ToggleResult = { ok: true } | { ok: false; error: string };

/**
 * Flip a single variant's in-stock status. Revalidates /shop and the
 * product detail page so the storefront reflects the change immediately.
 */
export async function toggleVariantStock(
  variantId: string,
  inStock: boolean,
): Promise<ToggleResult> {
  await requireAdmin();
  if (typeof variantId !== "string" || variantId.length === 0) {
    return { ok: false, error: "Invalid variant ID" };
  }

  await db
    .update(productVariants)
    .set({ inStock })
    .where(eq(productVariants.id, variantId));

  // Revalidate storefront paths that render this variant
  revalidatePath("/admin/products");
  revalidatePath("/shop");

  // Look up product slug so we can target /products/[slug] specifically
  const [v] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (v) {
    const [p] = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, v.productId))
      .limit(1);
    if (p?.slug) {
      revalidatePath(`/products/${p.slug}`);
    }
  }

  return { ok: true };
}

export async function setLowStockThreshold(
  variantId: string,
  threshold: number | null,
): Promise<ToggleResult> {
  await requireAdmin();
  if (typeof variantId !== "string" || variantId.length === 0) {
    return { ok: false, error: "Invalid variant ID" };
  }
  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
    return { ok: false, error: "Threshold must be a non-negative integer" };
  }

  await db
    .update(productVariants)
    .set({ lowStockThreshold: threshold })
    .where(eq(productVariants.id, variantId));

  revalidatePath("/admin/products");
  return { ok: true };
}
