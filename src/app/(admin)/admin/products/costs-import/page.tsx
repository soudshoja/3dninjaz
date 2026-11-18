import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CostsImportClient } from "@/components/admin/costs-import-client";
import { requireAdmin } from "@/lib/auth-helpers";

export const metadata: Metadata = {
  title: "Admin · Import product costs",
  robots: { index: false, follow: false },
};

export default async function ProductCostsImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-[var(--color-brand-text-muted)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Products
        </Link>
        <h1 className="font-heading text-2xl text-[var(--color-brand-text-primary)] md:text-3xl">
          Import product costs
        </h1>
        <p className="max-w-2xl text-sm text-[var(--color-brand-text-muted)]">
          Fill in the cost sheet once, upload it here and every product gets its cost.
          You see exactly what will change before anything is saved.
        </p>
      </div>
      <CostsImportClient />
    </div>
  );
}
