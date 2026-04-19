import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getCoupon } from "@/actions/admin-coupons";
import { BRAND } from "@/lib/brand";
import { CouponForm } from "@/components/admin/coupon-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Edit coupon",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCouponPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const coupon = await getCoupon(id);
  if (!coupon) notFound();

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
          Edit {coupon.code}
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Code is locked once issued — only the discount values, dates, cap
          and active flag can change.
        </p>
        <CouponForm mode="edit" initial={coupon} />
      </div>
    </main>
  );
}
