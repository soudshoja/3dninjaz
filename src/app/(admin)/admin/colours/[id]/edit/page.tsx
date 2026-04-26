import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getColour } from "@/actions/admin-colours";
import { BRAND } from "@/lib/brand";
import { ColourForm } from "@/components/admin/colour-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Edit colour",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EditColourPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const colour = await getColour(id);
  if (!colour) notFound();

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
          Edit {colour.name}
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Editing name or hex here updates the library row only. Cascade rename
          across linked product variants ships in Plan 18-04.
        </p>
        <ColourForm mode="edit" initial={colour} />
      </div>
    </main>
  );
}
