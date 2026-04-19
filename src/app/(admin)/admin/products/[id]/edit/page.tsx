import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct } from "@/actions/products";
import { getCategories } from "@/actions/categories";
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

  const categories = await getCategories();

  const initialData: ProductFormInitial = {
    id: product.id,
    name: product.name,
    description: product.description,
    images: product.images ?? [],
    materialType: product.materialType,
    estimatedProductionDays: product.estimatedProductionDays,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    categoryId: product.categoryId,
    variants: product.variants.map((v) => ({
      size: v.size as "S" | "M" | "L",
      price: v.price,
      widthCm: v.widthCm,
      heightCm: v.heightCm,
      depthCm: v.depthCm,
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
      />
    </div>
  );
}
