"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { createProduct, updateProduct } from "@/actions/products";
import { updateProductType } from "@/actions/configurator";
import { ProductTypeRadio } from "@/components/admin/product-type-radio";
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
  /** Phase 19 (19-10) — image entries with captions; preferred over images[] when present */
  imagesV2?: Array<{ url: string; caption?: string | null; alt?: string | null }>;
  thumbnailIndex: number;
  materialType: string | null;
  estimatedProductionDays: number | null;
  isActive: boolean;
  isFeatured: boolean;
  categoryId: string | null;
  subcategoryId: string | null;
  // Phase 19 (19-03) — product type + lock state
  productType?: "stocked" | "configurable" | "keychain" | "vending";
  lockedReason?: string;
};

export type CategoryOption = { id: string; name: string };
export type SubcategoryOption = {
  id: string;
  categoryId: string;
  name: string;
};

const NO_CATEGORY = "none";

export function ProductForm({
  initialData,
  categories,
  subcategories,
}: {
  initialData?: ProductFormInitial;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
}) {
  const router = useRouter();
  const editing = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [images, setImages] = useState<string[]>(
    initialData?.imagesV2?.map((e) => e.url) ?? initialData?.images ?? []
  );
  // Phase 19 (19-10) — captions parallel to images[]; index-aligned.
  const [captions, setCaptions] = useState<string[]>(
    initialData?.imagesV2?.map((e) => e.caption ?? "") ?? (initialData?.images ?? []).map(() => "")
  );
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
  // Phase 19 (19-03) — product type state
  const [productType, setProductType] = useState<"stocked" | "configurable" | "keychain" | "vending">(
    initialData?.productType ?? "stocked"
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function validate(): string | null {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Product name is required";
    if (!description.trim()) next.description = "Description is required";
    // Phase 19 (19-10) — no image count cap (REQ-6)

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

    // Phase 19 (19-10) — build imagesV2 array with captions; images[] is derived from it.
    const imagesV2 = images.map((url, idx) => ({
      url,
      caption: captions[idx]?.trim() || null,
      alt: null,
    }));

    const payload = {
      name: name.trim(),
      description: description.trim(),
      images,
      imagesV2,
      thumbnailIndex: safeThumbnailIndex,
      materialType: materialType.trim(),
      estimatedProductionDays:
        productionDays === "" ? undefined : Number(productionDays),
      isActive,
      isFeatured,
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      subcategoryId: subcategoryId === NO_CATEGORY ? null : subcategoryId,
      // Phase 19 (19-03) — include productType in every save
      productType,
      variants: [],
    };

    startTransition(async () => {
      // Phase 19 (19-03) — if editing and productType changed, call updateProductType
      // before the regular updateProduct to enforce attachment guard server-side.
      if (editing && initialData!.productType !== productType) {
        const typeResult = await updateProductType(initialData!.id, productType);
        if (!typeResult.ok) {
          setSubmitError(typeResult.error);
          return;
        }
      }

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

      if (!editing && "productId" in result && result.productId) {
        // Phase 19 (19-03) — new configurable + keychain products go to configurator,
        // stocked to variants. Keychain is pre-seeded but fully editable.
        if (productType === "configurable" || productType === "keychain" || productType === "vending") {
          router.push(`/admin/products/${result.productId}/configurator`);
        } else {
          router.push(`/admin/products/${result.productId}/variants`);
        }
      } else {
        router.push("/admin/products");
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Phase 19 (19-03) — Product type radio: must be first child of form */}
      <Card>
        <CardHeader>
          <CardTitle>Product Type</CardTitle>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            Choose the type before filling in details. This determines how customers interact with the product.
          </p>
        </CardHeader>
        <CardContent>
          <ProductTypeRadio
            value={productType}
            onChange={setProductType}
            locked={!!initialData?.lockedReason}
            lockedReason={initialData?.lockedReason}
          />
        </CardContent>
      </Card>

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
          <p className="text-xs text-[var(--color-brand-text-muted)]">
            No count limit. Recommended: 4–8 images for best customer experience.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ImageUploader
            images={images}
            onImagesChange={(next) => {
              // Keep captions array in sync: prune removed entries, pad new ones.
              setCaptions((prev) => {
                const next2 = next.map((url) => {
                  const idx = images.indexOf(url);
                  return idx >= 0 ? (prev[idx] ?? "") : "";
                });
                return next2;
              });
              setImages(next);
            }}
            productId={initialData?.id}
            maxImages={999}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
          />
          {/* Phase 19 (19-10) — caption input per image */}
          {images.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-brand-text-muted)]">
                Captions (shown under each image on the product page — optional)
              </p>
              {images.map((url, idx) => (
                <div key={url + idx} className="flex items-center gap-2">
                  <span className="min-w-[24px] text-xs text-[var(--color-brand-text-muted)]">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={captions[idx] ?? ""}
                    onChange={(e) =>
                      setCaptions((prev) => {
                        const next = [...prev];
                        next[idx] = e.target.value;
                        return next;
                      })
                    }
                    placeholder={`Caption for image ${idx + 1}`}
                    maxLength={200}
                    className="h-8 flex-1 rounded-md border border-[var(--color-brand-border)] bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-blue)]"
                  />
                </div>
              ))}
            </div>
          )}
          {errors.images && (
            <p className="mt-2 text-sm text-red-500">{errors.images}</p>
          )}
        </CardContent>
      </Card>

      {/* Variants — only shown for stocked products; configurator link shown for configurable */}
      {productType === "stocked" && (
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
            <p className="text-sm text-[var(--color-brand-text-muted)]">
              Sizes, colors, parts, prices, stock, and images are managed on the
              dedicated variants page.
            </p>
          </CardHeader>
          <CardContent>
            {initialData?.id ? (
              <a
                href={`/admin/products/${initialData.id}/variants`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Manage variants →
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">
                Save the product first, then manage its variants.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {/* Phase 19 (19-03) — Configurator link for made-to-order products */}
      {productType === "configurable" && initialData?.id && (
        <Card>
          <CardHeader>
            <CardTitle>Configurator</CardTitle>
            <p className="text-sm text-[var(--color-brand-text-muted)]">
              Define the customisation fields customers fill in (name, colours, etc.) and set tier pricing.
            </p>
          </CardHeader>
          <CardContent>
            <a
              href={`/admin/products/${initialData.id}/configurator`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Manage Configurator →
            </a>
          </CardContent>
        </Card>
      )}
      {/* Keyboard Clicker — pre-seeded but editable */}
      {productType === "keychain" && initialData?.id && (
        <Card>
          <CardHeader>
            <CardTitle>Keyboard Clicker — Pre-Seeded Fields</CardTitle>
            <p className="text-sm text-[var(--color-brand-text-muted)]">
              Created with 4 starter fields: 1 name text field + 3 colour fields (base / clicker / letter). All fields are fully editable — rename labels, restrict palettes, add or remove fields.
            </p>
          </CardHeader>
          <CardContent>
            <a
              href={`/admin/products/${initialData.id}/configurator`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Manage Keyboard Clicker Fields →
            </a>
          </CardContent>
        </Card>
      )}
      {/* Vending Machine — pre-seeded but editable */}
      {productType === "vending" && initialData?.id && (
        <Card>
          <CardHeader>
            <CardTitle>Vending Machine — Pre-Seeded Fields</CardTitle>
            <p className="text-sm text-[var(--color-brand-text-muted)]">
              Created with 2 locked colour fields (Primary / Secondary). Set the allowed-colour palette per field via the configurator (your colour gallery).
            </p>
          </CardHeader>
          <CardContent>
            <a
              href={`/admin/products/${initialData.id}/configurator`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Manage Vending Machine Fields →
            </a>
          </CardContent>
        </Card>
      )}

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

      <div className="flex flex-wrap items-center justify-end gap-3">
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
