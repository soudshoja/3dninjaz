import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CostCapture } from "@/components/admin/cost-capture";
import { ProductsCostTable } from "@/components/admin/products-cost-table";
import { requireAdmin } from "@/lib/auth-helpers";
import { loadProductCostRows } from "@/lib/product-cost-rows";

export const metadata: Metadata = {
  title: "Admin · Enter product costs",
  robots: { index: false, follow: false },
};

export default async function ProductCostsCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireAdmin();
  const { view } = await searchParams;
  const rows = await loadProductCostRows();
  const listView = view === "list";

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-[var(--color-brand-text-muted)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Products
        </Link>
        <h1 className="font-heading text-2xl text-[var(--color-brand-text-primary)] md:text-3xl">
          Enter product costs
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          {listView
            ? "Type a cost into each product. Press Enter or tap away to save."
            : "One product at a time. Type what it costs you to make, then tap Save and next."}
        </p>
      </div>
      {listView ? <ProductsCostTable rows={rows} cardsOnly /> : <CostCapture rows={rows} />}
    </div>
  );
}
