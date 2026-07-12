import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getGeneration } from "@/actions/admin-meshy";
import { AdminMeshyDetail } from "@/components/admin/admin-meshy-detail";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Meshy generation",
  robots: { index: false, follow: false },
};

/**
 * /admin/meshy/[id] — the review cockpit (Phase 21 21-07).
 *
 * requireAdmin() is called here at the top even though (admin)/layout.tsx
 * also redirects unauthenticated users — belt-and-braces, CVE-2025-29927.
 *
 * getGeneration() already serializes dates to ISO strings and JSON-parses
 * localModelFiles/printabilityReport (src/actions/admin-meshy.ts) — the
 * result is passed straight through as `initial` to the client component,
 * which owns polling + all state-matrix interactivity from there.
 */
export default async function AdminMeshyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const generation = await getGeneration(id);
  if (!generation) notFound();

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <AdminMeshyDetail initial={generation} />
      </div>
    </main>
  );
}
