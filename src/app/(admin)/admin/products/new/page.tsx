import type { Metadata } from "next";
import { getCategories } from "@/actions/categories";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = {
  title: "New Product | 3D Ninjaz Admin",
};

export default async function NewProductPage() {
  const categories = await getCategories();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
          Create New Product
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          Fill in the details below to add a new 3D printed product.
        </p>
      </div>
      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
