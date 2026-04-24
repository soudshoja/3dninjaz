import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct } from "@/actions/products";
import { getCategories, getAllSubcategories } from "@/actions/categories";
import { getStoreSettingsCached } from "@/lib/store-settings";
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

  const [categories, subcategories, storeSettings] = await Promise.all([
    getCategories(),
    getAllSubcategories(),
    getStoreSettingsCached(),
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
      // Phase 14 — cost breakdown fields
      filamentGrams: v.filamentGrams ?? null,
      printTimeHours: v.printTimeHours ?? null,
      laborMinutes: v.laborMinutes ?? null,
      otherCostBreakdown: v.otherCost ?? null,
      filamentRateOverride: v.filamentRateOverride ?? null,
      laborRateOverride: v.laborRateOverride ?? null,
      costPriceManual: v.costPriceManual ?? false,
    })),
  };

  const storeRates = {
    filamentCostPerKg: storeSettings.defaultFilamentCostPerKg,
    electricityCostPerKwh: storeSettings.defaultElectricityCostPerKwh,
    electricityKwhPerHour: storeSettings.defaultElectricityKwhPerHour,
    laborRatePerHour: storeSettings.defaultLaborRatePerHour,
    overheadPercent: storeSettings.defaultOverheadPercent,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
            Edit Product
          </h1>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            {product.name}
          </p>
        </div>
        {/* Phase 16 — Manage Variants link (only shown after product exists) */}
        <a
          href={`/admin/products/${id}/variants`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Manage Variants →
        </a>
      </div>
      <ProductForm
        initialData={initialData}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        subcategories={subcategories.map((s) => ({
          id: s.id,
          categoryId: s.categoryId,
          name: s.name,
        }))}
        storeRates={storeRates}
      />
    </div>
  );
}
