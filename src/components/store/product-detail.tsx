"use client";

import { useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { formatMYR, priceRangeMYR } from "@/lib/format";
import { ProductGallery } from "@/components/store/product-gallery";
import { SizeSelector } from "@/components/store/size-selector";
import { SizeGuide } from "@/components/store/size-guide";
import { AddToBagButton } from "@/components/store/add-to-bag-button";
import { WishlistButton } from "@/components/store/wishlist-button";

type Size = "S" | "M" | "L";

type Variant = {
  id: string;
  size: Size;
  price: string;
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
};

type ProductDetailProps = {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    images: string[];
    materialType: string | null;
    estimatedProductionDays: number | null;
    category: { name: string; slug: string } | null;
    variants: Variant[];
  };
  // Phase 6 06-04 — initial wishlist state fetched server-side on PDP page.
  isWishlistedInitial?: boolean;
};

const SIZE_ORDER: Record<Size, number> = { S: 0, M: 1, L: 2 };

/**
 * Stateful PDP container. Owns the selected-size state and composes
 * gallery + name + live price + description + size selector + size guide +
 * material/lead-time + Add-to-bag. Props are kept intentionally small so
 * the client bundle only carries what it needs.
 */
export function ProductDetail({
  product,
  isWishlistedInitial = false,
}: ProductDetailProps) {
  const sortedVariants = useMemo(
    () =>
      [...product.variants].sort(
        (a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size]
      ),
    [product.variants]
  );
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const selectedVariant =
    sortedVariants.find((v) => v.size === selectedSize) ?? null;

  const priceLabel = selectedVariant
    ? formatMYR(selectedVariant.price)
    : priceRangeMYR(sortedVariants);

  const material = product.materialType ?? "PLA"; // D2-13 fallback
  const leadDays = product.estimatedProductionDays ?? 7; // D2-14 fallback

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 md:py-16 grid lg:grid-cols-2 gap-10 md:gap-14">
      <div>
        <ProductGallery images={product.images} alt={product.name} />
      </div>

      {/*
        `min-w-0` on the flex-col right column is required so the size-guide
        <table> (inside `overflow-x-auto`) can actually shrink to the grid-cell
        width. Without it, the table's intrinsic width (wider than 320px on
        small phones) pushes the column wider than the viewport and spills
        horizontal scroll onto the document.
       */}
      <div className="min-w-0 flex flex-col">
        {product.category ? (
          <a
            href={`/shop?category=${encodeURIComponent(product.category.slug)}`}
            className="text-xs tracking-[0.2em] font-bold mb-3"
            style={{ color: BRAND.purple }}
          >
            {product.category.name.toUpperCase()}
          </a>
        ) : null}

        <h1
          className="font-[var(--font-heading)] text-3xl md:text-5xl leading-tight mb-4"
          style={{ color: BRAND.ink }}
        >
          {product.name}
        </h1>

        <p
          className="inline-flex self-start rounded-full px-5 py-2 text-lg font-bold text-white mb-6"
          style={{ backgroundColor: BRAND.ink }}
        >
          {priceLabel}
        </p>

        <p className="text-base leading-relaxed mb-6" style={{ color: BRAND.ink }}>
          {product.description}
        </p>

        <SizeSelector
          variants={sortedVariants}
          selectedSize={selectedSize}
          onSelect={setSelectedSize}
        />

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <AddToBagButton
              selectedVariant={selectedVariant}
              productId={product.id}
              productSlug={product.slug}
              productName={product.name}
              productImage={product.images[0] ?? null}
            />
          </div>
          <WishlistButton
            productId={product.id}
            initialState={isWishlistedInitial}
            variant="pill"
          />
        </div>

        {/* Lead time notice — PROD-06 */}
        <p
          className="mt-4 rounded-2xl px-4 py-3 text-sm font-medium"
          style={{ backgroundColor: `${BRAND.green}20`, color: BRAND.ink }}
        >
          Ships in {leadDays} business days from Kuala Lumpur.
        </p>

        {/* Material + how-it's-made — PROD-05 */}
        <section
          className="mt-6 rounded-2xl border-2 p-5"
          style={{ borderColor: BRAND.ink }}
        >
          <h2
            className="font-[var(--font-heading)] text-xl mb-2"
            style={{ color: BRAND.ink }}
          >
            Material &amp; craft
          </h2>
          <p className="text-sm text-slate-700 mb-2">
            <span className="font-bold">Material:</span> {material}
          </p>
          <p className="text-sm text-slate-700">
            Every piece is printed to order on our Kuala Lumpur printers, layer
            by ninja layer. Hand-finished, inspected, then shipped straight to
            your door.
          </p>
        </section>

        {/* Size guide — PROD-04 */}
        <SizeGuide variants={sortedVariants} />
      </div>
    </div>
  );
}
