import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfiguratorBuilder } from "@/components/admin/configurator-builder";
import { getConfiguratorData } from "@/actions/configurator";

// ============================================================================
// Phase 19-04 — Configurator RSC page
// Hydrates ConfiguratorBuilder with product + fields data.
// Only accessible for configurable products — stocked products redirect to
// the variants page.
// ============================================================================

export const metadata: Metadata = {
  title: "Admin · Configurator",
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function ConfiguratorPage({ params }: { params: Params }) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getConfiguratorData>>;
  try {
    data = await getConfiguratorData(id);
  } catch {
    notFound();
  }

  // Guard: this page is for configurable + keychain + vending products.
  // Quick task 260430-icx — `simple` has its own /fields editor at
  // /admin/products/<id>/fields. Stocked has /variants. Block both here.
  if (data.product.productType !== "configurable" && data.product.productType !== "keychain" && data.product.productType !== "vending") {
    const isSimple = data.product.productType === "simple";
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-bold">
          {isSimple
            ? "Use the Simple-product fields editor"
            : "This product is stocked, not made-to-order"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSimple
            ? "Simple products manage fields at /admin/products/<id>/fields."
            : "The configurator is only available for Made-to-Order, Keychain, and Vending products."}
        </p>
        <a
          href={isSimple ? `/admin/products/${id}/fields` : `/admin/products/${id}/variants`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          {isSimple ? "Manage Simple Fields →" : "Manage variants instead →"}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <ConfiguratorBuilder initial={data} />
    </div>
  );
}
