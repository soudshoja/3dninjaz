import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { getIncomeEntryById, listIncomeProjectTags } from "@/actions/admin-income";
import { getExpenseFacets } from "@/actions/admin-accounting";
import { IncomeForm } from "@/components/admin/accounting/income-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Edit income",
  robots: { index: false, follow: false },
};

export default async function EditIncomePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [row, incomeTags, facets] = await Promise.all([
    getIncomeEntryById(id),
    listIncomeProjectTags(),
    getExpenseFacets(),
  ]);
  if (!row) notFound();
  const tags = [...new Set([...incomeTags, ...facets.projectTags])].sort((a, b) => a.localeCompare(b));
  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/admin/accounting/income"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to income
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">Edit income</h1>
        <p className="mt-1 mb-6 text-slate-600">Changes show in the totals straight away.</p>
        <IncomeForm mode="edit" initial={row} projectTags={tags} />
      </div>
    </main>
  );
}
