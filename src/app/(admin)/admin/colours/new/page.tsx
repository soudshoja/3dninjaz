import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { ColourForm } from "@/components/admin/colour-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · New colour",
  robots: { index: false, follow: false },
};

export default async function NewColourPage() {
  await requireAdmin();
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/admin/colours"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to colours
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">
          New colour
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Add a colour to the central library. Brand + code together must be
          unique. The picker shows admin-only fields (code, family, previous
          hex); customer surfaces show only name and hex.
        </p>
        <ColourForm mode="new" />
      </div>
    </main>
  );
}
