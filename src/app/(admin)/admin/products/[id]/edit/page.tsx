import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct } from "@/actions/products";
import { getCategories, getAllSubcategories } from "@/actions/categories";
import {
  ProductForm,
  type ProductFormInitial,
} from "@/components/admin/product-form";

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

  const [categories, subcategories] = await Promise.all([
    getCategories(),
    getAllSubcategories(),
  ]);

  const initialData: ProductFormInitial = {
    id: product.id,
    name: product.name,
    description: product.description,
    images: product.images ?? [],
    thumbnailIndex: product.thumbnailIndex ?? 0,
    materialType: product.materialType,
    estimatedProductionDays: product.estimatedProductionDays,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    variants: product.variants.map((v) => ({
      size: v.size as "S" | "M" | "L",
      price: v.price,
      costPrice: v.costPrice ?? null,
      widthCm: v.widthCm,
      heightCm: v.heightCm,
      depthCm: v.depthCm,
      // Phase 13 — stock tracking fields; default to on-demand for older rows.
      trackStock: v.trackStock ?? false,
      stock: v.stock ?? 0,
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
          Edit Product
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          {product.name}
        </p>
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
