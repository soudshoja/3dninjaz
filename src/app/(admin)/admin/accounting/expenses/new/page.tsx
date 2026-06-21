import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { ExpenseForm } from "@/components/admin/accounting/expense-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · New expense",
  robots: { index: false, follow: false },
};

export default async function NewExpensePage() {
  await requireAdmin();
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
          New expense
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Record a business cost. Amounts are stored in MYR and feed the
          accounting overview and profit calculations.
        </p>
        <ExpenseForm mode="new" />
      </div>
    </main>
  );
}
