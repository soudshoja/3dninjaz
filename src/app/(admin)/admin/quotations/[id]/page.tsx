import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getQuotation } from "@/actions/admin-quotations";
import { QuotationForm } from "@/components/admin/quotation-form";
import { QuotationActions } from "@/components/admin/quotation-actions";
import {
  ensureTermsArray,
  formatQuoteNo,
  formatQuoteMoney,
  formatQuoteDate,
  isQuoteExpired,
  QUOTATION_STATUS_LABELS,
} from "@/lib/quotations";
import { formatOrderNumber } from "@/lib/orders";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Quotation",
  robots: { index: false, follow: false },
};

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const quote = await getQuotation(id);
  if (!quote) notFound();

  const locked = quote.status === "deposit_paid" || quote.status === "completed";
  const expired = isQuoteExpired(quote);

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
            Quotation {formatQuoteNo(quote.quoteNo)}
          </h1>
          <p className="mt-1 text-slate-600">
            {QUOTATION_STATUS_LABELS[quote.status] ?? quote.status}
            {expired ? " · expired" : ""} · valid until{" "}
            {formatQuoteDate(quote.validUntil)} · total{" "}
            <strong>{formatQuoteMoney(quote.totalAmount)}</strong>
          </p>
          {quote.orderId ? (
            <p className="mt-2 text-sm">
              Linked order{" "}
              <Link
                href={`/admin/orders/${quote.orderId}`}
                className="font-bold underline underline-offset-2"
              >
                {formatOrderNumber(quote.orderId)}
              </Link>
            </p>
          ) : null}
        </header>

        <section className="mb-8 rounded-2xl bg-white p-5">
          <QuotationActions
            id={quote.id}
            status={quote.status}
            depositLabel={formatQuoteMoney(quote.depositAmount)}
            totalLabel={formatQuoteMoney(quote.totalAmount)}
            hasItems={quote.items.length > 0}
          />
        </section>

        {locked ? (
          <section className="rounded-2xl bg-white p-5">
            <h2 className="mb-3 font-[var(--font-heading)] text-xl">Details</h2>
            <p className="mb-4 text-sm text-slate-600">
              This quotation has been paid, so it is read-only. The linked order
              is where fulfilment continues.
            </p>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="font-bold">Client</dt>
                <dd>
                  {quote.contactName}
                  {quote.companyName ? ` — ${quote.companyName}` : ""}
                </dd>
              </div>
              <div>
                <dt className="font-bold">Contact</dt>
                <dd>{quote.contactPhone || quote.contactEmail || "not given"}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-bold">Project</dt>
                <dd className="whitespace-pre-wrap">
                  {quote.projectDescription || "not given"}
                </dd>
              </div>
            </dl>

            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-black/20 text-left">
                  <th className="pb-2">Package inclusion</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((it) => (
                  <tr key={it.id} className="border-b border-black/5">
                    <td className="py-2">{it.description}</td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2 text-right">
                      {parseFloat(it.unitPrice) > 0
                        ? formatQuoteMoney(it.unitPrice)
                        : ""}
                    </td>
                    <td className="py-2 text-right">
                      {parseFloat(it.lineTotal) > 0
                        ? formatQuoteMoney(it.lineTotal)
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <QuotationForm
            initial={{
              id: quote.id,
              contactName: quote.contactName,
              companyName: quote.companyName ?? "",
              contactEmail: quote.contactEmail ?? "",
              contactPhone: quote.contactPhone ?? "",
              contactAddress: quote.contactAddress ?? "",
              projectDescription: quote.projectDescription ?? "",
              productionLeadTime: quote.productionLeadTime ?? "",
              validUntil: quote.validUntil,
              depositPercent: String(parseFloat(quote.depositPercent)),
              notes: quote.notes ?? "",
              terms: ensureTermsArray(quote.terms),
              items: quote.items.map((it) => ({
                description: it.description,
                quantity: it.quantity,
                unitPrice: String(parseFloat(it.unitPrice)),
              })),
            }}
          />
        )}
      </div>
    </main>
  );
}
