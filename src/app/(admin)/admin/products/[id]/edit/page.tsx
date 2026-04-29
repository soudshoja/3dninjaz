import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct } from "@/actions/products";
import { getCategories, getAllSubcategories } from "@/actions/categories";
import {
  ProductForm,
  type ProductFormInitial,
} from "@/components/admin/product-form";
import { db } from "@/lib/db";
import { productVariants, productConfigFields } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

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

  const [categories, subcategories, variantCountRow, fieldCountRow] = await Promise.all([
    getCategories(),
    getAllSubcategories(),
    // Phase 19 (19-03) — detect attached data to drive locked-radio state
    db.select({ c: sql<number>`COUNT(*)` }).from(productVariants).where(eq(productVariants.productId, id)),
    db.select({ c: sql<number>`COUNT(*)` }).from(productConfigFields).where(eq(productConfigFields.productId, id)),
  ]);

  const variantCount = Number(variantCountRow[0]?.c ?? 0);
  const fieldCount = Number(fieldCountRow[0]?.c ?? 0);
  const lockedReason =
    variantCount > 0
      ? "This product already has variants — type cannot be changed. Delete all variants first."
      : fieldCount > 0
        ? "This product already has configurator fields — type cannot be changed. Delete all fields first."
        : undefined;

  const productType = (product.productType ?? "stocked") as "stocked" | "configurable" | "keychain";

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
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
            Edit Product
          </h1>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            {product.name}
          </p>
        </div>
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
        ) : (
          <a
            href={`/admin/products/${id}/variants`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px]"
          >
            Manage Variants →
          </a>
        )}
      </div>
      <ProductForm
        initialData={initialData}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        subcategories={subcategories.map((s) => ({
          id: s.id,
          categoryId: s.categoryId,
          name: s.name,
        }))}
      />
    </div>
  );
}
