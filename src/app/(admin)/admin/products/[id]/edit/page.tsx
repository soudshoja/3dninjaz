import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct } from "@/actions/products";
import { getCategories, getAllSubcategories } from "@/actions/categories";
// Quick task 260430-kmr — hydrate inline fields server-side for simple + configurable.
import { getConfiguratorData } from "@/actions/configurator";
import {
  ProductForm,
  type ProductFormInitial,
} from "@/components/admin/product-form";
import { db } from "@/lib/db";
import { productVariants, productConfigFields } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getActiveCustomFontsForLoader } from "@/actions/custom-fonts";

export const metadata: Metadata = {
  title: "Admin · Edit Product",
  robots: { index: false, follow: false },
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [categories, subcategories, variantCountRow, fieldCountRow, activeCustomFonts] = await Promise.all([
    getCategories(),
    getAllSubcategories(),
    // Phase 19 (19-03) — detect attached data to drive locked-radio state
    db.select({ c: sql<number>`COUNT(*)` }).from(productVariants).where(eq(productVariants.productId, id)),
    db.select({ c: sql<number>`COUNT(*)` }).from(productConfigFields).where(eq(productConfigFields.productId, id)),
    getActiveCustomFontsForLoader().catch(() => [] as { familySlug: string; fileUrl: string; displayName: string }[]),
  ]);

  const variantCount = Number(variantCountRow[0]?.c ?? 0);
  const fieldCount = Number(fieldCountRow[0]?.c ?? 0);
  const lockedReason =
    variantCount > 0
      ? "This product already has variants — type cannot be changed. Delete all variants first."
      : fieldCount > 0
        ? "This product already has configurator fields — type cannot be changed. Delete all fields first."
        : undefined;

  // Quick task 260430-icx — `simple` added to type union.
  const productType = (product.productType ?? "stocked") as
    | "stocked"
    | "configurable"
    | "keychain"
    | "vending"
    | "simple";

  // Quick task 260430-icx — derive flat-price string from priceTiers["1"]
  // for the form's <Input> value when productType === "simple".
  const simplePriceValue =
    productType === "simple" && product.priceTiers && typeof product.priceTiers["1"] === "number"
      ? String(product.priceTiers["1"])
      : null;

  // Quick task 260430-kmr — hydrate config fields for simple + configurable
  // so the inline fields editor renders pre-filled. Other types manage fields
  // via /configurator (keychain/vending) or /variants (stocked).
  const initialFields =
    productType === "simple" || productType === "configurable"
      ? (await getConfiguratorData(id)).fields
      : undefined;

  // Header price chip — visible regardless of product type so admin sees
  // the configured price at a glance without opening variants/configurator.
  const headerPriceLabel = (() => {
    if (productType === "stocked") {
      const prices = (product.variants ?? [])
        .map((v: { price: string }) => Number.parseFloat(v.price))
        .filter((n: number) => Number.isFinite(n))
        .sort((a: number, b: number) => a - b);
      if (prices.length === 0) return null;
      const min = prices[0];
      const max = prices[prices.length - 1];
      return min === max ? `MYR ${min.toFixed(2)}` : `MYR ${min.toFixed(2)} – ${max.toFixed(2)}`;
    }
    let tiers: Record<string, number> = {};
    if (product.priceTiers && typeof product.priceTiers === "object") {
      tiers = product.priceTiers as Record<string, number>;
    } else if (typeof product.priceTiers === "string") {
      try {
        const parsed = JSON.parse(product.priceTiers);
        if (parsed && typeof parsed === "object") tiers = parsed;
      } catch {
        /* ignore */
      }
    }
    const tierValues = Object.values(tiers).filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    if (tierValues.length === 0) return null;
    const min = Math.min(...tierValues);
    const max = Math.max(...tierValues);
    return min === max ? `MYR ${min.toFixed(2)}` : `MYR ${min.toFixed(2)} – ${max.toFixed(2)}`;
  })();

  const initialData: ProductFormInitial = {
    id: product.id,
    name: product.name,
    description: product.description,
    images: product.images ?? [],
    // Phase 19 (19-10) — pass V2 entries so captions survive a reload and so
    // the form initialises images[] from imagesV2 when the DB has object-shape
    // entries (i.e. images stored as [{url,caption,alt}] rather than string[]).
    imagesV2: product.imagesV2,
    thumbnailIndex: product.thumbnailIndex ?? 0,
    materialType: product.materialType,
    estimatedProductionDays: product.estimatedProductionDays,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    // Phase 19 (19-03) — product type + lock state
    productType,
    lockedReason,
    simplePrice: simplePriceValue,
    // Quick task 260430-kmr — pre-load config fields for inline editor.
    initialFields,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
            Edit Product
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--color-brand-text-muted)]">
              {product.name}
            </p>
            {headerPriceLabel ? (
              <span
                className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200"
                title={`Configured price (productType: ${productType})`}
              >
                {headerPriceLabel}
              </span>
            ) : (
              <span
                className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 border border-amber-200"
                title="No price configured yet — set one before publishing"
              >
                No price set
              </span>
            )}
            <span
              className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200"
            >
              {productType}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/products/${product.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--color-brand-blue)] text-[var(--color-brand-blue)] text-sm font-medium hover:bg-slate-50 transition-colors min-h-[44px]"
          >
            View product ↗
          </a>
          {/* Phase 19 (19-03) — swap Manage Variants for Manage Configurator on configurable products */}
          {productType === "configurable" ? (
            <a
              href={`/admin/products/${id}/configurator`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px]"
            >
              Manage Configurator →
            </a>
          ) : productType === "keychain" ? (
            <a
              href={`/admin/products/${id}/configurator`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px]"
            >
              Manage Keyboard Clicker Fields →
            </a>
          ) : productType === "vending" ? (
            <a
              href={`/admin/products/${id}/configurator`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px]"
            >
              Manage Vending Machine Fields →
            </a>
          ) : productType === "simple" ? (
            // Quick task 260430-kmr — Manage Fields → header link removed for
            // simple. Fields are inline on /edit; admin doesn't need a hop.
            null
          ) : (
            <a
              href={`/admin/products/${id}/variants`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px]"
            >
              Manage Variants →
            </a>
          )}
        </div>
      </div>
      <ProductForm
        initialData={initialData}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        subcategories={subcategories.map((s) => ({
          id: s.id,
          categoryId: s.categoryId,
          name: s.name,
        }))}
        customFonts={activeCustomFonts}
      />
    </div>
  );
}
