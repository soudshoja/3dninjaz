import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimpleFieldsEditor } from "@/components/admin/simple-fields-editor";
import { getConfiguratorData } from "@/actions/configurator";

// ============================================================================
// Quick task 260430-icx — /admin/products/[id]/fields RSC page.
// Re-uses getConfiguratorData() — the data shape (product summary + fields)
// is identical to what the configurator builder needs. Only the editor UI
// differs (no tier-pricing, no preview).
// ============================================================================

export const metadata: Metadata = {
  title: "Admin · Simple Product Fields",
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function SimpleFieldsPage({ params }: { params: Params }) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getConfiguratorData>>;
  try {
    data = await getConfiguratorData(id);
  } catch {
    notFound();
  }

  if (data.product.productType !== "simple") {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-bold">Not a Simple product</h1>
        <p className="text-sm text-muted-foreground">
          This page is only for products with type Simple. Use the configurator
          for Made-to-Order / Keychain / Vending products, or the variants page
          for Stocked products.
        </p>
        <a
          href={`/admin/products/${id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          ← Back to product
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <SimpleFieldsEditor initial={data} />
    </div>
  );
}
