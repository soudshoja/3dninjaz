import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct } from "@/actions/products";
import { hydrateProductVariants } from "@/lib/variants";
import { VariantEditor } from "@/components/admin/variant-editor";

export const metadata: Metadata = {
  title: "Admin · Manage Variants",
  robots: { index: false, follow: false },
};

export default async function VariantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const { options, variants } = await hydrateProductVariants(id);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <a
            href={`/admin/products/${id}/edit`}
            className="text-sm text-[var(--color-brand-text-muted)] hover:underline"
          >
            ← Back to product
          </a>
        </div>
        <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)] mt-2">
          Manage Variants
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          {product.name}
        </p>
      </div>
      <VariantEditor
        productId={id}
        initialOptions={options}
        initialVariants={variants}
      />
    </div>
  );
}
