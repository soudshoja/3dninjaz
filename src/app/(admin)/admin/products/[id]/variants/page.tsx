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

  // Quick task 260501-spv — variants page accepts stocked + simple.
  // Configurable / keychain / vending have a configurator, not variants.
  const productType = (product.productType ?? "stocked") as
    | "stocked"
    | "configurable"
    | "keychain"
    | "vending"
    | "simple";
  if (productType !== "stocked" && productType !== "simple") {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-bold">This product type does not use variants</h1>
        <p className="text-sm text-muted-foreground">
          {productType === "configurable" || productType === "keychain" || productType === "vending"
            ? "Configurable / keyboard-clicker / vending products manage their pricing through the configurator."
            : "Variants are only available for Stocked and Simple products."}
        </p>
        <a
          href={`/admin/products/${id}/configurator`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Manage configurator →
        </a>
      </div>
    );
  }

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
          {productType === "simple" && (
            <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 border border-blue-200">
              Simple · 1 axis max
            </span>
          )}
        </p>
      </div>
      <VariantEditor
        productId={id}
        productSlug={product.slug}
        initialOptions={options}
        initialVariants={variants}
        productType={productType === "simple" ? "simple" : "stocked"}
      />
    </div>
  );
}
