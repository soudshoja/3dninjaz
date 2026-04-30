"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { createProduct, updateProduct } from "@/actions/products";
import { updateProductType } from "@/actions/configurator";
import { ProductTypeRadio } from "@/components/admin/product-type-radio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
// Quick task 260430-kmr — Quill rich-text editor for description (universal — all product types).
import { NovelRichTextEditor } from "@/components/admin/novel-rich-text-editor";
// Quick task 260430-kmr — inline fields editor for simple + configurable productTypes.
import { InlineFieldsEditor, type PendingField } from "@/components/admin/inline-fields-editor";
import { DraftRestoredBanner } from "@/components/admin/draft-restored-banner";
import { useProductDraft } from "@/hooks/use-product-draft";
import type { ConfigField } from "@/actions/configurator";

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
  // Quick task 260430-icx — `simple` added.
  productType?: "stocked" | "configurable" | "keychain" | "vending" | "simple";
  lockedReason?: string;
  /** Quick task 260430-icx — flat MYR price for `simple` products only. */
  simplePrice?: string | null;
  /**
   * Quick task 260430-kmr — config fields for simple + configurable productTypes.
   * Server hydrates this in the edit page via getConfiguratorData(id).fields.
   * Undefined for keychain/vending/stocked — those manage fields elsewhere.
   */
  initialFields?: ConfigField[];
};

export type CategoryOption = { id: string; name: string };
export type SubcategoryOption = {
  id: string;
  categoryId: string;
  name: string;
};

const NO_CATEGORY = "none";

// Quick task 260430-kmr — convert a server-shaped ConfigField to the local
// PendingField shape used by InlineFieldsEditor.
function asPending(f: ConfigField): PendingField {
  return { ...f, __pending: "untouched" } as PendingField;
}

// Quick task 260430-kmr — convert a PendingField back to the wire shape sent
// to updateProduct. New fields (tmp- ids) emit id: undefined so the server
// inserts a new row; existing rows keep their UUID.
function stripPendingFlag(f: PendingField) {
  const isNew = f.__pending === "new" || f.id.startsWith("tmp-");
  return {
    id: isNew ? undefined : f.id,
    fieldType: f.fieldType,
    label: f.label,
    helpText: f.helpText ?? null,
    required: f.required,
    config: f.config,
  };
}

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
  // Quick task 260430-icx — `simple` added.
  const [productType, setProductType] = useState<"stocked" | "configurable" | "keychain" | "vending" | "simple">(
    initialData?.productType ?? "stocked"
  );
  // Quick task 260430-icx — flat price for `simple` productType.
  const [simplePrice, setSimplePrice] = useState<string>(
    initialData?.simplePrice ?? ""
  );

  // Quick task 260430-kmr — inline fields state for simple + configurable.
  // For other product types initialFields is undefined; we keep an empty
  // array locally but only mount InlineFieldsEditor for simple/configurable.
  const [fields, setFields] = useState<PendingField[]>(
    () => (initialData?.initialFields ?? []).map(asPending)
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Quick task 260430-kmr — autosave draft. The form-state object is the
  // single source of truth bubbled into useProductDraft; on Save success we
  // call draft.discard() so the next mount sees no banner.
  const formState = useMemo(
    () => ({
      name,
      description,
      images,
      captions,
      thumbnailIndex,
      categoryId,
      subcategoryId,
      materialType,
      productionDays,
      isActive,
      isFeatured,
      productType,
      simplePrice,
      fields,
    }),
    [
      name,
      description,
      images,
      captions,
      thumbnailIndex,
      categoryId,
      subcategoryId,
      materialType,
      productionDays,
      isActive,
      isFeatured,
      productType,
      simplePrice,
      fields,
    ],
  );

  const draftKey = initialData?.id ?? "new";
  const draft = useProductDraft(draftKey, formState);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  function restoreDraft() {
    const v = draft.restore();
    if (!v) {
      setBannerDismissed(true);
      return;
    }
    // Hydrate every field from the snapshot. Be defensive about missing keys
    // (older drafts may not contain newer fields).
    if (typeof v.name === "string") setName(v.name);
    if (typeof v.description === "string") setDescription(v.description);
    if (Array.isArray(v.images)) setImages(v.images);
    if (Array.isArray(v.captions)) setCaptions(v.captions);
    if (typeof v.thumbnailIndex === "number") setThumbnailIndex(v.thumbnailIndex);
    if (typeof v.categoryId === "string") setCategoryId(v.categoryId);
    if (typeof v.subcategoryId === "string") setSubcategoryId(v.subcategoryId);
    if (typeof v.materialType === "string") setMaterialType(v.materialType);
    if (typeof v.productionDays === "string") setProductionDays(v.productionDays);
    if (typeof v.isActive === "boolean") setIsActive(v.isActive);
    if (typeof v.isFeatured === "boolean") setIsFeatured(v.isFeatured);
    if (typeof v.productType === "string") {
      setProductType(v.productType as typeof productType);
    }
    if (typeof v.simplePrice === "string") setSimplePrice(v.simplePrice);
    if (Array.isArray(v.fields)) setFields(v.fields as PendingField[]);
    setBannerDismissed(true);
  }

  function discardDraft() {
    draft.discard();
    setBannerDismissed(true);
  }

  function validate(): string | null {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Product name is required";
    // Quick task 260430-kmr — Quill emits "<p><br></p>" for an empty editor.
    // Reject when the sanitised plain-text equivalent is empty so admin can't
    // ship an empty description by tabbing through the editor.
    const descriptionPlain = description.replace(/<[^>]*>/g, "").trim();
    if (!descriptionPlain) next.description = "Description is required";
    // Phase 19 (19-10) — no image count cap (REQ-6)

    if (
      productionDays !== "" &&
      (!/^\d+$/.test(productionDays) || Number(productionDays) <= 0)
    ) {
      next.productionDays = "Must be a positive whole number";
    }

    // Quick task 260430-icx — simplePrice required + numeric for `simple` products.
    if (productType === "simple") {
      const trimmed = simplePrice.trim();
      if (!trimmed) {
        next.simplePrice = "Valid price required (e.g. 19.99)";
      } else if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
        next.simplePrice = "Price must be a number with up to 2 decimal places";
      }
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
      // Quick task 260430-icx — only include simplePrice when relevant.
      ...(productType === "simple" ? { simplePrice: simplePrice.trim() } : {}),
      // Quick task 260430-kmr — single Save commits inline fields atomically
      // for simple + configurable. Server-side updateProduct fans out to
      // addConfigField/updateConfigField/deleteConfigField/reorderConfigFields.
      ...((productType === "simple" || productType === "configurable")
        ? { fields: fields.map(stripPendingFlag) }
        : {}),
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

      // Quick task 260430-kmr — successful save clears the autosave snapshot.
      draft.discard();

      if (!editing && "productId" in result && result.productId) {
        // Phase 19 (19-03) — new configurable + keychain products go to configurator,
        // stocked to variants. Keychain is pre-seeded but fully editable.
        // Quick task 260430-icx — `simple` redirects to its own /fields editor
        // (no auto-seed; admin curates fields freely).
        // Quick task 260430-kmr — `simple` now lands directly on the unified
        // /edit page since fields are managed inline (no /fields hop).
        if (productType === "simple") {
          router.push(`/admin/products/${result.productId}/edit`);
        } else if (productType === "configurable" || productType === "keychain" || productType === "vending") {
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
      {/* Quick task 260430-kmr — autosave restore banner. Renders only when a
          snapshot exists for this product (or for "new" in the create flow)
          and the admin hasn't already chosen Restore/Discard this session. */}
      {draft.draft && !bannerDismissed && (
        <DraftRestoredBanner
          savedAt={draft.draft.savedAt}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
        />
      )}
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
            {/* Quick task 260430-kmr — Quill rich-text editor for description on
                ALL product types. Output is HTML; sanitised server-side via
                sanitizeRichText() in src/actions/products.ts on every save. */}
            <NovelRichTextEditor
              value={description}
              onChange={setDescription}
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
      {/* Quick task 260430-kmr — unified inline fields editor for simple AND
          configurable products. Description editor (Quill) is universal in
          Basic Info above; this card adds price-as-first-row + accordion
          field rows + Up/Down reorder + Add field popover. Single Save below
          commits everything atomically via updateProduct.

          Tier-pricing for configurable products remains on /configurator —
          the editor renders a read-only summary + link for the price row. */}
      {(productType === "simple" || productType === "configurable") && (
        <InlineFieldsEditor
          productId={initialData?.id ?? null}
          productType={productType as "simple" | "configurable"}
          initialFields={fields}
          initialPrice={simplePrice}
          onPriceChange={setSimplePrice}
          onFieldsChange={setFields}
        />
      )}
      {/* Surface the simple-product price validation error inline (the editor
          owns the input but errors flow through the form's errors map). */}
      {productType === "simple" && errors.simplePrice && (
        <p className="text-sm text-red-500" role="alert">
          {errors.simplePrice}
        </p>
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
