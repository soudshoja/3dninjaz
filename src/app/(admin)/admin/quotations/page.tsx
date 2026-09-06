import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listQuotations } from "@/actions/admin-quotations";
import {
  formatQuoteNo,
  formatQuoteMoney,
  formatQuoteDate,
  isQuoteExpired,
  QUOTATION_STATUS_LABELS,
} from "@/lib/quotations";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Quotations",
  robots: { index: false, follow: false },
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  draft: { bg: "#F1F5F9", fg: "#475569" },
  sent: { bg: "#FEF3C7", fg: "#92400E" },
  deposit_paid: { bg: "#DBEAFE", fg: "#1E40AF" },
  completed: { bg: "#DCFCE7", fg: "#166534" },
  cancelled: { bg: "#F1F5F9", fg: "#94A3B8" },
  expired: { bg: "#FEE2E2", fg: "#991B1B" },
};

function Chip({ label, tone }: { label: string; tone: string }) {
  const s = STATUS_STYLE[tone] ?? STATUS_STYLE.draft;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {label}
    </span>
  );
}

export default async function AdminQuotationsPage() {
  await requireAdmin();
  const quotes = await listQuotations();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Quotations
            </h1>
            <p className="mt-1 text-slate-600">
              The quotation goes out first and carries the payment terms. When
              payment is marked, an order is created and the usual invoice is
              sent.
            </p>
          </div>
          <Link
            href="/admin/quotations/new"
            className="inline-flex items-center rounded-full px-5 text-sm font-bold text-white"
            style={{ minHeight: 48, backgroundColor: BRAND.ink }}
          >
            New quotation
          </Link>
        </header>

        {quotes.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center">
            <p className="mb-2 text-lg font-bold">No quotations yet.</p>
            <p className="text-sm text-slate-600">
              Create one to send a client your terms before taking payment.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/10 overflow-hidden rounded-2xl bg-white">
            {quotes.map((q) => {
              const expired = isQuoteExpired(q);
              return (
                <Link
                  key={q.id}
                  href={`/admin/quotations/${q.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold break-words">
                      {formatQuoteNo(q.quoteNo)} · {q.contactName}
                      {q.companyName ? ` — ${q.companyName}` : ""}
                    </p>
                    <p className="text-xs text-slate-600">
                      Valid until {formatQuoteDate(q.validUntil)} · created{" "}
                      {formatQuoteDate(q.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">
                      {formatQuoteMoney(q.totalAmount)}
                    </span>
                    <Chip
                      label={
                        expired
                          ? "Expired"
                          : QUOTATION_STATUS_LABELS[q.status] ?? q.status
                      }
                      tone={expired ? "expired" : q.status}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
