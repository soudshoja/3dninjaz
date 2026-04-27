import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveProductBySlug } from "@/lib/catalog";
import { ProductDetail } from "@/components/store/product-detail";
import { isWishlisted } from "@/actions/wishlist";
import { listProductReviews } from "@/actions/reviews";
import { ProductReviews } from "@/components/store/product-reviews";
// Phase 7 (07-08) — pre-resolve <picture> sources from manifest on the server
// so the client gallery can render avif/webp/jpeg srcset without a server
// component nested inside it.
import { pickImage } from "@/lib/image-manifest";
// Phase 16 — generic variant hydration
import { hydrateProductVariants } from "@/lib/variants";
// Phase 19 (19-06) — configurable product hydration
import { getConfigurableProductData } from "@/lib/configurable-product-data";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getActiveProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
  };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getActiveProductBySlug(slug);
  if (!product) notFound();

  // Phase 6 06-04 — server-side fetch of the wishlist state for this product
  // so the heart button on PDP renders with the correct initial fill.
  // Phase 6 06-05 — fetch the approved-review summary for the rating badge
  // in the PDP header, then render the full reviews list below ProductDetail.
  const [wished, reviewsSummary, pictures, { options, variants: hydratedVariants }] = await Promise.all([
    isWishlisted(product.id),
    listProductReviews(product.id, { limit: 10 }),
    Promise.all(product.images.map((u) => pickImage(u))),
    hydrateProductVariants(product.id),
  ]);

  // Phase 19 (19-06) — fetch configurable-product data when productType === "configurable"
  const configurableData =
    product.productType === "configurable"
      ? await getConfigurableProductData(product.id)
      : undefined;

  // Phase 17 — resolve per-variant PictureData server-side so the client gallery
  // can swap to the variant image using the full srcset pipeline (AD-02).
  const variantPictureEntries = await Promise.all(
    hydratedVariants
      .filter((v) => v.imageUrl)
      .map(async (v) => [v.id, await pickImage(v.imageUrl!)] as const),
  );
  const variantPictures = Object.fromEntries(variantPictureEntries);

  // Marshal to a client-safe plain object. Only pass what ProductDetail needs
  // — keeps the client bundle tight and avoids shipping server-only fields.
  return (
    <>
      <ProductDetail
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          images: product.images,
          // Phase 19 (19-10) — captions parallel to images[] for configurable PDP figcaption
          imageCaptions: product.imagesV2.map((e) => e.caption ?? null),
          materialType: product.materialType,
          estimatedProductionDays: product.estimatedProductionDays,
          category: product.category
            ? { name: product.category.name, slug: product.category.slug }
            : null,
          // Phase 16 — generic options + hydrated variants for VariantSelector
          options,
          hydratedVariants,
          // Phase 19 (19-06) — product type discriminator
          productType: product.productType,
        }}
        isWishlistedInitial={wished}
        ratingAvg={reviewsSummary.avgRating}
        ratingCount={reviewsSummary.totalApproved}
        pictures={pictures}
        variantPictures={variantPictures}
        configurableData={configurableData}
      />
      <div className="max-w-6xl mx-auto px-6 pb-16 -mt-6">
        <ProductReviews productId={product.id} />
      </div>
    </>
  );
}
