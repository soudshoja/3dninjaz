import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { AdminMeshyUploadForm } from "@/components/admin/admin-meshy-upload-form";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · New Meshy Generation",
  robots: { index: false, follow: false },
};

/**
 * /admin/meshy/new — dedicated upload page (Phase 21 21-06), not a modal:
 * the form has real content (photo + prompt + guardrail copy) an admin may
 * want to reference while composing.
 *
 * requireAdmin() is called here at the top even though (admin)/layout.tsx
 * also redirects unauthenticated users — belt-and-braces, CVE-2025-29927.
 */
export default async function AdminMeshyNewPage() {
  await requireAdmin();

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">New Generation</h1>
          <p className="mt-1 text-slate-600">Upload a reference photo to start a 3D generation.</p>
        </header>

        <div className="rounded-2xl bg-white p-6">
          <AdminMeshyUploadForm />
        </div>
      </div>
    </main>
  );
}
