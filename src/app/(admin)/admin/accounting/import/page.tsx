import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { InvoiceImport } from "@/components/admin/accounting/invoice-import";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Import invoice",
  robots: { index: false, follow: false },
};

export default async function ImportInvoicePage() {
  await requireAdmin();
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/admin/accounting"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to accounting
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">
          Import invoice
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Photograph a receipt or upload a PDF — fields are auto-detected.
        </p>
        <InvoiceImport />
      </div>
    </main>
  );
}
