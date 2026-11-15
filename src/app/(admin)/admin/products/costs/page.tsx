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

const tab =
  "flex h-11 items-center justify-center rounded-lg px-3 text-base font-medium transition-colors ";

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
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center gap-1">
        <Link
          href="/admin/products"
          aria-label="Back to products"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--color-brand-text-muted)] hover:bg-white"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="font-heading text-2xl text-[var(--color-brand-text-primary)] md:text-3xl">
          Product costs
        </h1>
      </div>

      <nav
        aria-label="How to enter costs"
        className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1"
      >
        <Link
          href="/admin/products/costs"
          aria-current={listView ? undefined : "page"}
          className={
            tab +
            (listView
              ? "text-[var(--color-brand-text-muted)]"
              : "bg-white font-semibold text-[var(--color-brand-ink)] shadow-sm")
          }
        >
          One by one
        </Link>
        <Link
          href="/admin/products/costs?view=list"
          aria-current={listView ? "page" : undefined}
          className={
            tab +
            (listView
              ? "bg-white font-semibold text-[var(--color-brand-ink)] shadow-sm"
              : "text-[var(--color-brand-text-muted)]")
          }
        >
          All products
        </Link>
      </nav>

      {listView ? <ProductsCostTable rows={rows} cardsOnly /> : <CostCapture rows={rows} />}
    </div>
  );
}
