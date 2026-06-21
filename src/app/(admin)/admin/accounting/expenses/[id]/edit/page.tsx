import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { getExpenseById } from "@/actions/admin-accounting";
import { ExpenseForm } from "@/components/admin/accounting/expense-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Edit expense",
  robots: { index: false, follow: false },
};

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const row = await getExpenseById(id);
  if (!row) notFound();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/admin/accounting/expenses"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to expenses
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">
          Edit expense
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Update the expense details below. Changes are saved server-side and
          immediately reflected in the accounting totals.
        </p>
        <ExpenseForm mode="edit" initial={row} />
      </div>
    </main>
  );
}
