"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { createProduct, updateProduct } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/admin/image-uploader";
import {
  computeVariantCost,
  type StoreCostDefaults,
} from "@/lib/cost-breakdown";

export type ProductFormInitial = {
  id: string;
  name: string;
  description: string;
  images: string[];
  thumbnailIndex: number;
  materialType: string | null;
  estimatedProductionDays: number | null;
  isActive: boolean;
  isFeatured: boolean;
  categoryId: string | null;
  subcategoryId: string | null;
  variants: Array<{
    size: "S" | "M" | "L";
    price: string;
    costPrice: string | null;
    widthCm: string | null;
    heightCm: string | null;
    depthCm: string | null;
    trackStock: boolean;
    stock: number;
    // Phase 14 — cost breakdown fields
    filamentGrams: string | null;
    printTimeHours: string | null;
    laborMinutes: string | null;
    otherCostBreakdown: string | null;
    filamentRateOverride: string | null;
    laborRateOverride: string | null;
    costPriceManual: boolean;
  }>;
};

export type ProductFormStoreRates = StoreCostDefaults;

export type CategoryOption = { id: string; name: string };
export type SubcategoryOption = {
  id: string;
  categoryId: string;
  name: string;
};

type VariantRow = {
  size: "S" | "M" | "L";
  enabled: boolean;
  price: string;
  costPrice: string;
  widthCm: string;
  heightCm: string;
  depthCm: string;
  trackStock: boolean;
  stock: string;
  // Phase 14 — cost breakdown fields
  filamentGrams: string;
  printTimeHours: string;
  laborMinutes: string;
  otherCostBreakdown: string;
  filamentRateOverride: string;
  laborRateOverride: string;
  costPriceManual: boolean;
};

const SIZES: Array<{ key: "S" | "M" | "L"; label: string }> = [
  { key: "S", label: "Small" },
  { key: "M", label: "Medium" },
  { key: "L", label: "Large" },
];

const NO_CATEGORY = "none";

function initialVariants(
  initial: ProductFormInitial | undefined
): VariantRow[] {
  const present = new Map(initial?.variants.map((v) => [v.size, v]) ?? []);
  return SIZES.map(({ key }) => {
    const existing = present.get(key);
    return {
      size: key,
      enabled: !!existing,
      price: existing?.price ?? "",
      costPrice: existing?.costPrice ?? "",
      widthCm: existing?.widthCm ?? "",
      heightCm: existing?.heightCm ?? "",
      depthCm: existing?.depthCm ?? "",
      trackStock: existing?.trackStock ?? false,
      stock: existing ? String(existing.stock ?? 0) : "0",
      // Phase 14
      filamentGrams: existing?.filamentGrams ?? "",
      printTimeHours: existing?.printTimeHours ?? "",
      laborMinutes: existing?.laborMinutes ?? "",
      otherCostBreakdown: existing?.otherCostBreakdown ?? "",
      filamentRateOverride: existing?.filamentRateOverride ?? "",
      laborRateOverride: existing?.laborRateOverride ?? "",
      costPriceManual: existing?.costPriceManual ?? false,
    };
  });
}

/**
 * Phase 10 (10-01) — live margin readout for a variant row.
 */
function computeVariantMargin(
  priceRaw: string,
  costRaw: string,
): { text: string; tone: "muted" | "positive" | "negative" } {
  if (!costRaw.trim()) {
    return { text: "Cost empty", tone: "muted" };
  }
  const price = parseFloat(priceRaw);
  const cost = parseFloat(costRaw);
  if (!Number.isFinite(price) || !Number.isFinite(cost)) {
    return { text: "—", tone: "muted" };
  }
  const margin = price - cost;
  const pct = price > 0 ? (margin / price) * 100 : 0;
  const sign = margin >= 0 ? "+" : "";
  const tone = margin >= 0 ? "positive" : "negative";
  return {
    text: `${sign}RM ${margin.toFixed(2)} (${sign}${pct.toFixed(1)}%)`,
    tone,
  };
}

/**
 * Phase 14 — Live cost breakdown readout shown under each variant's Cost tab.
 */
function CostBreakdownReadout({
  variant,
  storeRates,
  price,
}: {
  variant: VariantRow;
  storeRates: StoreCostDefaults;
  price: string;
}) {
  const bd = computeVariantCost(
    {
      costPriceManual: variant.costPriceManual,
      costPrice: variant.costPrice,
      filamentGrams: variant.filamentGrams,
      printTimeHours: variant.printTimeHours,
      laborMinutes: variant.laborMinutes,
      otherCost: variant.otherCostBreakdown,
      filamentRateOverride: variant.filamentRateOverride,
      laborRateOverride: variant.laborRateOverride,
    },
    storeRates,
  );

  const priceNum = parseFloat(price);
  const margin = Number.isFinite(priceNum) ? priceNum - bd.total : null;
  const marginPct =
    margin !== null && priceNum > 0 ? (margin / priceNum) * 100 : null;

  const fmt = (v: number) => `RM ${v.toFixed(2)}`;

  if (bd.isManual) {
    return (
      <div className="rounded-lg bg-slate-50 border border-[var(--color-brand-border)] px-4 py-3 text-xs space-y-1">
        <p className="font-semibold text-[var(--color-brand-text-muted)]">
          Manual override — breakdown not available
        </p>
        <p className="text-[var(--color-brand-text-muted)]">
          Total cost: <span className="font-bold text-[var(--color-brand-text-primary)]">{fmt(bd.total)}</span>
          {margin !== null && (
            <span className={`ml-3 ${margin >= 0 ? "text-green-600" : "text-red-500"}`}>
              Margin: {margin >= 0 ? "+" : ""}{fmt(margin)}
              {marginPct !== null && ` (${marginPct.toFixed(1)}%)`}
            </span>
          )}
        </p>
      </div>
    );
  }

  const parts = [
    { label: "Filament", value: bd.filamentCost },
    { label: "Electricity", value: bd.electricityCost },
    { label: "Labor", value: bd.laborCost },
    { label: "Other", value: bd.otherCost },
    { label: `Overhead (${storeRates.overheadPercent ?? 0}%)`, value: bd.overheadCost },
  ].filter((p) => p.value > 0);

  if (bd.total === 0) {
    return (
      <div className="rounded-lg bg-slate-50 border border-[var(--color-brand-border)] px-4 py-3 text-xs text-[var(--color-brand-text-muted)]">
        Fill in the inputs above to see a live cost breakdown.
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-slate-50 border border-[var(--color-brand-border)] px-4 py-3 text-xs space-y-1">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[var(--color-brand-text-muted)]">
        {parts.map((p) => (
          <span key={p.label}>
            {p.label} <span className="font-medium text-[var(--color-brand-text-primary)]">{fmt(p.value)}</span>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-[var(--color-brand-border)]">
        <span className="font-bold text-[var(--color-brand-text-primary)]">
          Total {fmt(bd.total)}
        </span>
        {margin !== null && (
          <span className={`font-semibold ${margin >= 0 ? "text-green-600" : "text-red-500"}`}>
            Margin: {margin >= 0 ? "+" : ""}{fmt(margin)}
            {marginPct !== null && ` (${marginPct.toFixed(1)}%)`}
          </span>
        )}
      </div>
    </div>
  );
}

export function ProductForm({
  initialData,
  categories,
  subcategories,
  storeRates = {},
}: {
  initialData?: ProductFormInitial;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  /**
   * Phase 14 — store-level cost defaults passed from the server page so the
   * client can compute live cost breakdowns without a round-trip.
   */
  storeRates?: StoreCostDefaults;
}) {
  const router = useRouter();
  const editing = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [thumbnailIndex, setThumbnailIndex] = useState<number>(
    initialData?.thumbnailIndex ?? 0
  );
  const [categoryId, setCategoryId] = useState<string>(
    initialData?.categoryId ?? NO_CATEGORY
  );
  const [subcategoryId, setSubcategoryId] = useState<string>(
    initialData?.subcategoryId ?? NO_CATEGORY,
  );
  const [materialType, setMaterialType] = useState(
    initialData?.materialType ?? ""
  );
  const [productionDays, setProductionDays] = useState(
    initialData?.estimatedProductionDays
      ? String(initialData.estimatedProductionDays)
      : ""
  );
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(initialData?.isFeatured ?? false);
  const [variants, setVariants] = useState<VariantRow[]>(
    initialVariants(initialData)
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Phase 14 — tab state for the Variants card (no external dep needed)
  const [variantTab, setVariantTab] = useState<"pricing" | "cost">("pricing");

  function updateVariant(idx: number, patch: Partial<VariantRow>) {
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }

  function validate(): string | null {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Product name is required";
    if (!description.trim()) next.description = "Description is required";
    if (images.length > 10) next.images = "Maximum 10 images allowed";

    const enabledVariants = variants.filter((v) => v.enabled);
    if (enabledVariants.length === 0) {
      next.variants = "At least one size variant with a price is required";
    }
    for (const v of enabledVariants) {
      if (!v.price || !/^\d+(\.\d{1,2})?$/.test(v.price)) {
        next[`price_${v.size}`] = "Price must be a valid MYR amount";
      }
      if (v.costPrice && !/^\d+(\.\d{1,2})?$/.test(v.costPrice)) {
        next[`cost_${v.size}`] = "Cost must be a valid MYR amount";
      }
    }

    if (
      productionDays !== "" &&
      (!/^\d+$/.test(productionDays) || Number(productionDays) <= 0)
    ) {
      next.productionDays = "Must be a positive whole number";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return "Please fix the errors above.";
    return null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    const problem = validate();
    if (problem) {
      setSubmitError(problem);
      return;
    }

    const safeThumbnailIndex =
      images.length > 0 && thumbnailIndex >= 0 && thumbnailIndex < images.length
        ? thumbnailIndex
        : 0;

    const payload = {
      name: name.trim(),
      description: description.trim(),
      images,
      thumbnailIndex: safeThumbnailIndex,
      materialType: materialType.trim(),
      estimatedProductionDays:
        productionDays === "" ? undefined : Number(productionDays),
      isActive,
      isFeatured,
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      subcategoryId: subcategoryId === NO_CATEGORY ? null : subcategoryId,
      variants: variants
        .filter((v) => v.enabled)
        .map((v) => ({
          size: v.size,
          price: v.price,
          costPrice: v.costPrice,
          widthCm: v.widthCm,
          heightCm: v.heightCm,
          depthCm: v.depthCm,
          trackStock: v.trackStock,
          stock: v.trackStock ? Math.max(0, parseInt(v.stock, 10) || 0) : 0,
          // Phase 14 — cost breakdown
          filamentGrams: v.filamentGrams,
          printTimeHours: v.printTimeHours,
          laborMinutes: v.laborMinutes,
          otherCostBreakdown: v.otherCostBreakdown,
          filamentRateOverride: v.filamentRateOverride,
          laborRateOverride: v.laborRateOverride,
          costPriceManual: v.costPriceManual,
        })),
    };

    startTransition(async () => {
      const result = editing
        ? await updateProduct(initialData!.id, payload)
        : await createProduct(payload);

      if ("error" in result) {
        if (typeof result.error === "string") {
          setSubmitError(result.error);
        } else {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.error)) {
            if (Array.isArray(v) && v.length > 0) flat[k] = v[0];
          }
          setErrors(flat);
          setSubmitError("Please fix the errors above.");
        }
        return;
      }

      router.push("/admin/products");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Product Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="h-10"
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description}</p>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={categoryId}
                onValueChange={(v: string | null) => {
                  const next = v ?? NO_CATEGORY;
                  setCategoryId(next);
                  if (subcategoryId !== NO_CATEGORY) {
                    const stillValid = subcategories.some(
                      (s) => s.id === subcategoryId && s.categoryId === next,
                    );
                    if (!stillValid) setSubcategoryId(NO_CATEGORY);
                  }
                }}
              >
                <SelectTrigger id="category" className="h-10 w-full">
                  <SelectValue placeholder="Select a category">
                    {(value: string | null) => {
                      if (!value || value === NO_CATEGORY) return "None";
                      const match = categories.find((c) => c.id === value);
                      return match?.name ?? "Select a category";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select
                value={subcategoryId}
                onValueChange={(v: string | null) =>
                  setSubcategoryId(v ?? NO_CATEGORY)
                }
                disabled={categoryId === NO_CATEGORY}
              >
                <SelectTrigger id="subcategory" className="h-10 w-full">
                  <SelectValue placeholder={
                    categoryId === NO_CATEGORY
                      ? "Pick a category first"
                      : "Select a subcategory"
                  }>
                    {(value: string | null) => {
                      if (!value || value === NO_CATEGORY) return "None";
                      const match = subcategories.find((s) => s.id === value);
                      return match?.name ?? "Select a subcategory";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>None</SelectItem>
                  {subcategories
                    .filter((s) => s.categoryId === categoryId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[var(--color-brand-text-muted)]">
                Products live in a subcategory. Category syncs automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploader
            images={images}
            onImagesChange={setImages}
            productId={initialData?.id}
            maxImages={10}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
          />
          {errors.images && (
            <p className="mt-2 text-sm text-red-500">{errors.images}</p>
          )}
        </CardContent>
      </Card>

      {/* Sizes, Pricing & Cost — tabbed */}
      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <p className="text-xs text-[var(--color-brand-text-muted)]">
            Toggle the sizes you offer. Use the Cost tab to set per-variant cost breakdowns.
          </p>
        </CardHeader>
        <CardContent>
          {/* Simple state-based tabs — no external UI dep */}
          <div className="mb-4 inline-flex rounded-lg bg-muted p-[3px] gap-1">
            {(["pricing", "cost"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setVariantTab(tab)}
                className={[
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  variantTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {tab === "pricing" ? "Sizes & Pricing" : "Cost"}
              </button>
            ))}
          </div>

          {/* ── Sizes & Pricing tab ── */}
          {variantTab === "pricing" && (
              <div className="space-y-4">
                {variants.map((v, idx) => {
                  const margin = computeVariantMargin(v.price, v.costPrice);
                  const toneClass =
                    margin.tone === "positive"
                      ? "text-green-600"
                      : margin.tone === "negative"
                        ? "text-red-500"
                        : "text-[var(--color-brand-text-muted)]";
                  return (
                    <div
                      key={v.size}
                      className="rounded-md border border-[var(--color-brand-border)] p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex items-center gap-2 md:w-32">
                          <Switch
                            checked={v.enabled}
                            onCheckedChange={(c: boolean) =>
                              updateVariant(idx, { enabled: c })
                            }
                          />
                          <span className="font-medium">
                            {SIZES.find((s) => s.key === v.size)?.label} ({v.size})
                          </span>
                        </div>

                        <div className="flex-1 space-y-3">
                          {/* Row 1: Price, Cost, Width, Height, Depth */}
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`price-${v.size}`}>
                                Price (MYR)
                              </Label>
                              <Input
                                id={`price-${v.size}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={v.price}
                                onChange={(e) =>
                                  updateVariant(idx, { price: e.target.value })
                                }
                                disabled={!v.enabled}
                                className="h-9"
                              />
                              {errors[`price_${v.size}`] && (
                                <p className="text-xs text-red-500">
                                  {errors[`price_${v.size}`]}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`cost-${v.size}`}>
                                Cost (MYR)
                              </Label>
                              <Input
                                id={`cost-${v.size}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="—"
                                value={v.costPrice}
                                onChange={(e) =>
                                  updateVariant(idx, { costPrice: e.target.value })
                                }
                                disabled={!v.enabled || !v.costPriceManual}
                                className="h-9"
                                title={!v.costPriceManual ? "Auto-computed from breakdown. Enable manual override in Cost tab." : undefined}
                              />
                              <p className={`text-[11px] leading-tight ${toneClass}`}>
                                {margin.text}
                              </p>
                              {errors[`cost_${v.size}`] && (
                                <p className="text-xs text-red-500">
                                  {errors[`cost_${v.size}`]}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`w-${v.size}`}>
                                Width (cm)
                              </Label>
                              <Input
                                id={`w-${v.size}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="—"
                                value={v.widthCm}
                                onChange={(e) =>
                                  updateVariant(idx, { widthCm: e.target.value })
                                }
                                disabled={!v.enabled}
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`h-${v.size}`}>
                                Height (cm)
                              </Label>
                              <Input
                                id={`h-${v.size}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="—"
                                value={v.heightCm}
                                onChange={(e) =>
                                  updateVariant(idx, { heightCm: e.target.value })
                                }
                                disabled={!v.enabled}
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`d-${v.size}`}>
                                Depth (cm)
                              </Label>
                              <Input
                                id={`d-${v.size}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="—"
                                value={v.depthCm}
                                onChange={(e) =>
                                  updateVariant(idx, { depthCm: e.target.value })
                                }
                                disabled={!v.enabled}
                                className="h-9"
                              />
                            </div>
                          </div>

                          {/* Row 2: Stock tracking (Phase 13) */}
                          <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-[var(--color-brand-border)]">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={v.trackStock}
                                disabled={!v.enabled}
                                onChange={(e) =>
                                  updateVariant(idx, { trackStock: e.target.checked })
                                }
                                className="h-4 w-4 rounded border-gray-300 accent-[var(--color-brand-primary)]"
                              />
                              <span className="text-xs font-medium">Track stock</span>
                            </label>
                            {v.trackStock ? (
                              <div className="flex items-center gap-2">
                                <Label className="text-xs whitespace-nowrap" htmlFor={`stock-${v.size}`}>
                                  Qty on hand
                                </Label>
                                <Input
                                  id={`stock-${v.size}`}
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  step={1}
                                  placeholder="0"
                                  value={v.stock}
                                  onChange={(e) =>
                                    updateVariant(idx, { stock: e.target.value })
                                  }
                                  disabled={!v.enabled}
                                  className="h-9 w-24"
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--color-brand-text-muted)]">
                                On-demand — no stock limit
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {errors.variants && (
                  <p className="text-sm text-red-500">{errors.variants}</p>
                )}
              </div>
          )}

          {/* ── Cost tab (Phase 14) ── */}
          {variantTab === "cost" && (
              <div className="space-y-6">
                <p className="text-xs text-[var(--color-brand-text-muted)]">
                  Enter quantities for each enabled size. Rates are pulled from{" "}
                  <a href="/admin/settings" className="underline" target="_blank">
                    Store Settings
                  </a>{" "}
                  unless overridden per-variant. The total is auto-saved as{" "}
                  <strong>cost_price</strong> when you save the product.
                </p>

                {variants.map((v, idx) => {
                  if (!v.enabled) return null;
                  const sizeLabel = SIZES.find((s) => s.key === v.size)?.label;
                  return (
                    <div
                      key={v.size}
                      className="rounded-md border border-[var(--color-brand-border)] p-4 space-y-4"
                    >
                      <h4 className="font-semibold text-sm">
                        {sizeLabel} ({v.size})
                      </h4>

                      {/* Manual override checkbox */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={v.costPriceManual}
                          onChange={(e) =>
                            updateVariant(idx, { costPriceManual: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-gray-300 accent-[var(--color-brand-primary)]"
                        />
                        <span className="text-xs font-medium">
                          Override auto-total — enter cost manually
                        </span>
                      </label>

                      {v.costPriceManual ? (
                        /* Manual cost entry */
                        <div className="space-y-1 max-w-xs">
                          <Label className="text-xs" htmlFor={`manual-cost-${v.size}`}>
                            Total cost (MYR)
                          </Label>
                          <Input
                            id={`manual-cost-${v.size}`}
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={v.costPrice}
                            onChange={(e) =>
                              updateVariant(idx, { costPrice: e.target.value })
                            }
                            className="h-9"
                          />
                          <p className="text-xs text-[var(--color-brand-text-muted)]">
                            Breakdown inputs are ignored while manual override is on.
                          </p>
                        </div>
                      ) : (
                        /* Breakdown inputs */
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                          <div className="space-y-1">
                            <Label className="text-xs" htmlFor={`filament-g-${v.size}`}>
                              Filament (grams)
                            </Label>
                            <Input
                              id={`filament-g-${v.size}`}
                              type="text"
                              inputMode="decimal"
                              placeholder="e.g. 45"
                              value={v.filamentGrams}
                              onChange={(e) =>
                                updateVariant(idx, { filamentGrams: e.target.value })
                              }
                              className="h-9"
                            />
                            <p className="text-[10px] text-[var(--color-brand-text-muted)]">
                              Rate: {storeRates.filamentCostPerKg
                                ? `RM ${Number(storeRates.filamentCostPerKg).toFixed(2)}/kg (store)`
                                : "no store rate"}
                              {v.filamentRateOverride && ` → override ${Number(v.filamentRateOverride).toFixed(2)}/kg`}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs" htmlFor={`filament-rate-${v.size}`}>
                              Filament rate override (MYR/kg)
                            </Label>
                            <Input
                              id={`filament-rate-${v.size}`}
                              type="text"
                              inputMode="decimal"
                              placeholder="Leave blank to use store rate"
                              value={v.filamentRateOverride}
                              onChange={(e) =>
                                updateVariant(idx, { filamentRateOverride: e.target.value })
                              }
                              className="h-9"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs" htmlFor={`print-time-${v.size}`}>
                              Print time (hours)
                            </Label>
                            <Input
                              id={`print-time-${v.size}`}
                              type="text"
                              inputMode="decimal"
                              placeholder="e.g. 3.5"
                              value={v.printTimeHours}
                              onChange={(e) =>
                                updateVariant(idx, { printTimeHours: e.target.value })
                              }
                              className="h-9"
                            />
                            <p className="text-[10px] text-[var(--color-brand-text-muted)]">
                              {storeRates.electricityCostPerKwh
                                ? `Electricity: RM ${Number(storeRates.electricityCostPerKwh).toFixed(4)}/kWh × ${Number(storeRates.electricityKwhPerHour ?? 0.15).toFixed(3)} kWh/hr`
                                : "No electricity rate set"}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs" htmlFor={`labor-min-${v.size}`}>
                              Labor (minutes)
                            </Label>
                            <Input
                              id={`labor-min-${v.size}`}
                              type="text"
                              inputMode="decimal"
                              placeholder="e.g. 20"
                              value={v.laborMinutes}
                              onChange={(e) =>
                                updateVariant(idx, { laborMinutes: e.target.value })
                              }
                              className="h-9"
                            />
                            <p className="text-[10px] text-[var(--color-brand-text-muted)]">
                              Rate: {storeRates.laborRatePerHour
                                ? `RM ${Number(storeRates.laborRatePerHour).toFixed(2)}/hr (store)`
                                : "no store rate"}
                              {v.laborRateOverride && ` → override RM ${Number(v.laborRateOverride).toFixed(2)}/hr`}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs" htmlFor={`labor-rate-${v.size}`}>
                              Labor rate override (MYR/hr)
                            </Label>
                            <Input
                              id={`labor-rate-${v.size}`}
                              type="text"
                              inputMode="decimal"
                              placeholder="Leave blank to use store rate"
                              value={v.laborRateOverride}
                              onChange={(e) =>
                                updateVariant(idx, { laborRateOverride: e.target.value })
                              }
                              className="h-9"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs" htmlFor={`other-cost-${v.size}`}>
                              Other / packaging (MYR)
                            </Label>
                            <Input
                              id={`other-cost-${v.size}`}
                              type="text"
                              inputMode="decimal"
                              placeholder="e.g. 1.50"
                              value={v.otherCostBreakdown}
                              onChange={(e) =>
                                updateVariant(idx, { otherCostBreakdown: e.target.value })
                              }
                              className="h-9"
                            />
                          </div>
                        </div>
                      )}

                      {/* Live breakdown readout */}
                      <CostBreakdownReadout
                        variant={v}
                        storeRates={storeRates}
                        price={v.price}
                      />
                    </div>
                  );
                })}

                {variants.every((v) => !v.enabled) && (
                  <p className="text-sm text-[var(--color-brand-text-muted)]">
                    Enable at least one size in the Sizes &amp; Pricing tab first.
                  </p>
                )}
              </div>
          )}
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="materialType">Material Type</Label>
            <Input
              id="materialType"
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
              placeholder="e.g. PLA, Resin, PETG"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="productionDays">Estimated Production Days</Label>
            <Input
              id="productionDays"
              type="text"
              inputMode="numeric"
              value={productionDays}
              onChange={(e) => setProductionDays(e.target.value)}
              placeholder="e.g. 3"
              className="h-10"
            />
            {errors.productionDays && (
              <p className="text-sm text-red-500">{errors.productionDays}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-md border border-[var(--color-brand-border)] p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-[var(--color-brand-text-muted)]">
                Visible to customers on the storefront.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>
          <label className="flex items-center justify-between rounded-md border border-[var(--color-brand-border)] p-3">
            <div>
              <p className="text-sm font-medium">Featured</p>
              <p className="text-xs text-[var(--color-brand-text-muted)]">
                Show on the homepage featured section.
              </p>
            </div>
            <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
          </label>
        </CardContent>
      </Card>

      {submitError && (
        <p className="text-sm text-red-500" role="alert">
          {submitError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/products")}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="h-10 gap-2 bg-[var(--color-brand-cta)] px-5 text-white hover:bg-[var(--color-brand-cta)]/90"
        >
          <Save className="h-4 w-4" />
          {pending
            ? editing
              ? "Updating..."
              : "Creating..."
            : editing
              ? "Update Product"
              : "Create Product"}
        </Button>
      </div>
    </form>
  );
}
