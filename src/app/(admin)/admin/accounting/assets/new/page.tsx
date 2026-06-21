import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { AssetForm } from "@/components/admin/accounting/asset-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · New asset",
  robots: { index: false, follow: false },
};

export default async function NewAssetPage() {
  await requireAdmin();
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/admin/accounting/assets"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to assets
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">
          New asset
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Assets are tracked separately and don&apos;t reduce profit.
        </p>
        <AssetForm mode="new" />
      </div>
    </main>
  );
}
