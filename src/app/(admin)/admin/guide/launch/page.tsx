import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth-helpers";
import { getGuideArticleBySlug } from "@/lib/admin-guide";
import { LaunchChecklist } from "@/components/admin/guide/launch-checklist";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Admin · Launch Checklist",
  robots: { index: false, follow: false },
};

/**
 * /admin/guide/launch — interactive launch checklist.
 *
 * Loads the launch.md article from the content library and passes it to
 * the LaunchChecklist client component, which extracts ## Step N headings
 * and renders them as interactive accordion items with localStorage-backed
 * checkboxes.
 */
export default async function AdminGuideLaunchPage() {
  await requireAdmin();
  const article = getGuideArticleBySlug("launch");

  if (!article) {
    return (
      <div className="p-8 text-center text-slate-600">
        Launch checklist content not found.
      </div>
    );
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm">
          <Link href="/admin/guide" className="underline decoration-dotted" style={{ color: BRAND.blue }}>
            ← Guide
          </Link>
        </nav>

        {/* Header */}
        <header className="mb-8 flex items-start gap-4">
          <Image
            src="/icons/ninja/emoji/great@128.png"
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 object-contain shrink-0"
          />
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Launch Checklist
            </h1>
            <p className="mt-1 text-slate-600">
              Follow these steps in order — from entering your first product to
              taking your first real payment. Tick each step as you go. Your
              progress is saved automatically.
            </p>
          </div>
        </header>

        {/* Interactive checklist */}
        <LaunchChecklist content={article.content} />
      </div>
    </main>
  );
}
