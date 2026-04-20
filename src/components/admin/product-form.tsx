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
    widthCm: string | null;
    heightCm: string | null;
    depthCm: string | null;
  }>;
};

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
  widthCm: string;
  heightCm: string;
  depthCm: string;
};

const SIZES: Array<{ key: "S" | "M" | "L"; label: string }> = [
  { key: "S", label: "Small" },
  { key: "M", label: "Medium" },
  { key: "L", label: "Large" },
];

// "none" is a sentinel for Select since Base-UI Select doesn't accept "" as a
// value for the empty state, and we want to map "none" back to null before submit.
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
      widthCm: existing?.widthCm ?? "",
      heightCm: existing?.heightCm ?? "",
      depthCm: existing?.depthCm ?? "",
    };
  });
}

export function ProductForm({
  initialData,
  categories,
  subcategories,
}: {
  initialData?: ProductFormInitial;
  categories: CategoryOption[];
  /**
   * Phase 8 — full flat list of subcategories across all categories. The
   * cascading dropdown filters this list client-side by the current
   * parent categoryId selection so the server doesn't need to round-trip
   * every time the parent changes.
   */
  subcategories: SubcategoryOption[];
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

    // Defensive bounds-check: if the picker points past the current images
    // array (image was removed without re-selecting), fall back to slot 0.
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
          widthCm: v.widthCm,
          heightCm: v.heightCm,
          depthCm: v.depthCm,
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
                  // When the parent changes, reset the subcategory selection
                  // if the previously-picked sub doesn't belong to the new
                  // parent — avoids submitting an orphaned FK pair.
                  if (subcategoryId !== NO_CATEGORY) {
                    const stillValid = subcategories.some(
                      (s) => s.id === subcategoryId && s.categoryId === next,
                    );
                    if (!stillValid) setSubcategoryId(NO_CATEGORY);
                  }
                }}
              >
                <SelectTrigger id="category" className="h-10 w-full">
                  {/*
                    base-ui's Select.Value defaults to printing the raw `value`
                    prop (the category UUID). Pass a children render prop to map
                    the id back to a label so the trigger shows the human name.
                  */}
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

      {/* Pricing & Sizes */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; Sizes</CardTitle>
          <p className="text-xs text-[var(--color-brand-text-muted)]">
            Toggle the sizes you offer and set the MYR price for each. Dimensions are optional.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {variants.map((v, idx) => (
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

                <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
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
              </div>
            </div>
          ))}
          {errors.variants && (
            <p className="text-sm text-red-500">{errors.variants}</p>
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
