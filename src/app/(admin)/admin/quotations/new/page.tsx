import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { QuotationForm } from "@/components/admin/quotation-form";
import { DEFAULT_QUOTE_TERMS, DEFAULT_LEAD_TIME } from "@/lib/quotations";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · New quotation",
  robots: { index: false, follow: false },
};

/** Default validity: 7 days out, matching the client's existing quotations. */
function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export default async function NewQuotationPage() {
  await requireAdmin();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-6">
          <Link
            href="/admin/quotations"
            className="text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            &larr; Quotations
          </Link>
          <h1 className="mt-2 font-[var(--font-heading)] text-3xl md:text-4xl">
            New quotation
          </h1>
        </header>

        <QuotationForm
          initial={{
            contactName: "",
            companyName: "",
            contactEmail: "",
            contactPhone: "",
            contactAddress: "",
            projectDescription: "",
            productionLeadTime: DEFAULT_LEAD_TIME,
            validUntil: defaultValidUntil(),
            depositPercent: "50",
            notes: "",
            terms: DEFAULT_QUOTE_TERMS,
            items: [],
          }}
        />
      </div>
    </main>
  );
}
