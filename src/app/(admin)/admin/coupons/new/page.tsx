import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { CouponForm } from "@/components/admin/coupon-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · New coupon",
  robots: { index: false, follow: false },
};

export default async function NewCouponPage() {
  await requireAdmin();
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/admin/coupons"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to coupons
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">
          New coupon
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Promo codes are case-insensitive and validated server-side at
          checkout. Discount math is computed from the DB row, never from the
          customer&apos;s browser.
        </p>
        <CouponForm mode="new" />
      </div>
    </main>
  );
}
