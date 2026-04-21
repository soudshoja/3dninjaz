import type { Metadata } from "next";
import { getCategories, getAllSubcategories } from "@/actions/categories";
import { getStoreSettingsCached } from "@/lib/store-settings";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = {
  title: "Admin · New Product",
  robots: { index: false, follow: false },
};

export default async function NewProductPage() {
  const [categories, subcategories, storeSettings] = await Promise.all([
    getCategories(),
    getAllSubcategories(),
    getStoreSettingsCached(),
  ]);

  const storeRates = {
    filamentCostPerKg: storeSettings.defaultFilamentCostPerKg,
    electricityCostPerKwh: storeSettings.defaultElectricityCostPerKwh,
    electricityKwhPerHour: storeSettings.defaultElectricityKwhPerHour,
    laborRatePerHour: storeSettings.defaultLaborRatePerHour,
    overheadPercent: storeSettings.defaultOverheadPercent,
  };

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
