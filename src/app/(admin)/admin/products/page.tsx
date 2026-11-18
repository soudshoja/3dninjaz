import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LatestDraftBanner } from "@/components/admin/latest-draft-banner";
import { ProductsCostTable } from "@/components/admin/products-cost-table";
import { requireAdmin } from "@/lib/auth-helpers";
import { loadProductCostRows } from "@/lib/product-cost-rows";

export const metadata: Metadata = {
  title: "Admin · Products",
  robots: { index: false, follow: false },
};

export default async function AdminProductsPage() {
  // Rows carry admin-only cost data; gate here as well as in the layout.
  await requireAdmin();
  const list = await loadProductCostRows();

  return (
    <div className="space-y-6">
      <LatestDraftBanner />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
            Products
          </h1>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            Manage your 3D printed product catalog and what each product costs you.
          </p>
        </div>
        <Link href="/admin/products/new">
          <Button className="h-10 gap-2 bg-[var(--color-brand-cta)] px-4 text-white hover:bg-[var(--color-brand-cta)]/90">
            <Plus className="h-4 w-4" />
            New Product
          </Button>
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white p-12 text-center">
          <Package className="h-10 w-10 text-[var(--color-brand-text-muted)]" />
          <h2 className="font-heading text-lg">No products yet</h2>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            Create your first 3D printed product to see it here.
          </p>
          <Link href="/admin/products/new">
            <Button className="mt-2 gap-2 bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90">
              <Plus className="h-4 w-4" />
              Create a Product
            </Button>
          </Link>
        </div>
      ) : (
        <ProductsCostTable rows={list} />
      )}
    </div>
  );
}
