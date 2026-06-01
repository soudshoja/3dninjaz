import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getConfiguratorData } from "@/actions/configurator";

// ============================================================================
// Quick task 260430-kmr — /admin/products/[id]/fields decommissioned for
// simple AND configurable. Both productTypes redirect to /edit (fields are
// inline on the unified edit page). Keychain/vending get a guard pointing
// at /configurator. Stocked redirects to /variants.
//
// SimpleFieldsEditor is no longer imported here. The component file remains
// in the tree as a one-revert path until the unified flow is proven; a
// follow-up cleanup task can delete it.
// ============================================================================

export const metadata: Metadata = {
  title: "Admin · Product Fields",
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function ProductFieldsPage({ params }: { params: Params }) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getConfiguratorData>>;
  try {
    data = await getConfiguratorData(id);
  } catch {
    notFound();
  }

  const t = data.product.productType;

  // Simple + configurable → unified edit page.
  if (t === "simple" || t === "configurable") {
    redirect(`/admin/products/${id}/edit`);
  }

  if (t === "keychain" || t === "vending") {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-bold">Use the configurator</h1>
        <p className="text-sm text-muted-foreground">
          {t === "keychain" ? "Keyboard Clicker" : "Vending Machine"} products
          manage their fields on the configurator (locked seed fields + tier
          pricing).
        </p>
        <div className="flex gap-2">
          <a
            href={`/admin/products/${id}/configurator`}
            className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Open configurator →
          </a>
          <a
            href={`/admin/products/${id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            ← Back to product
          </a>
        </div>
      </div>
    );
  }

  // Stocked → variants page.
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-bold">Use the variants page</h1>
      <p className="text-sm text-muted-foreground">
        Stocked products manage size/colour/part variants on the dedicated
        variants page.
      </p>
      <div className="flex gap-2">
        <a
          href={`/admin/products/${id}/variants`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Open variants →
        </a>
        <a
          href={`/admin/products/${id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          ← Back to product
        </a>
      </div>
    </div>
  );
}
