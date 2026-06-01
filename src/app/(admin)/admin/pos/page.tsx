import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { PosBuilder } from "@/components/admin/pos-builder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Point of Sale",
  robots: { index: false, follow: false },
};

/**
 * Phase 20 (20-09) — /admin/pos
 *
 * Admin POS surface for building offline orders on behalf of customers.
 * Supports stocked, configurable, keyboard clicker, and free-text lines
 * in the same order. After submission, admin is prompted to send a draft
 * payment link to the customer.
 */
export default async function AdminPosPage() {
  await requireAdmin();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl font-semibold">
            Point of Sale
          </h1>
          <p className="mt-1 text-slate-600">
            Build an offline order for a customer.
          </p>
        </header>
        <PosBuilder />
      </div>
    </main>
  );
}
