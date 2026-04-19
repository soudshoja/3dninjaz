import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveProductBySlug } from "@/lib/catalog";
import { ProductDetail } from "@/components/store/product-detail";
import { isWishlisted } from "@/actions/wishlist";

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
  const wished = await isWishlisted(product.id);

  // Marshal to a client-safe plain object. Only pass what ProductDetail needs
  // — keeps the client bundle tight and avoids shipping server-only fields.
  return (
    <ProductDetail
      product={{
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        images: product.images,
        materialType: product.materialType,
        estimatedProductionDays: product.estimatedProductionDays,
        category: product.category
          ? { name: product.category.name, slug: product.category.slug }
          : null,
        variants: product.variants.map((v) => ({
          id: v.id,
          size: v.size,
          price: v.price,
          widthCm: v.widthCm,
          heightCm: v.heightCm,
          depthCm: v.depthCm,
        })),
      }}
      isWishlistedInitial={wished}
    />
  );
}
