import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getDisputeWithOrder } from "@/actions/admin-disputes";
import { DisputeDetailPane } from "@/components/admin/dispute-detail-pane";
import { DisputeEvidenceUploader } from "@/components/admin/dispute-evidence-uploader";
import { DisputeActionBar } from "@/components/admin/dispute-action-bar";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Dispute detail",
  robots: { index: false, follow: false },
};

/**
 * Phase 7 (07-06) — /admin/disputes/[id] detail page.
 */
export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getDisputeWithOrder(decodeURIComponent(id));
  if (!detail) notFound();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <nav className="mb-4 text-sm">
          <Link href="/admin/disputes" className="underline decoration-dotted">
            &larr; All disputes
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-2xl md:text-3xl break-all">
            Dispute {detail.cached.disputeId}
          </h1>
        </header>

        <DisputeDetailPane detail={detail} />

        <section className="mt-6 rounded-2xl bg-white p-4 md:p-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-3">
            Take action
          </h2>
          <DisputeActionBar
            disputeId={detail.cached.disputeId}
            status={detail.cached.status}
            amount={detail.cached.amount}
            currency={detail.cached.currency}
          />
        </section>

        <section className="mt-6 rounded-2xl bg-white p-4 md:p-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-3">
            Submit evidence
          </h2>
          <p className="text-sm text-slate-600 mb-3">
            Upload up to 3 files (10 MB each) and a note. PayPal accepts
            tracking numbers, photos of shipped item, return policy, etc.
          </p>
          <DisputeEvidenceUploader disputeId={detail.cached.disputeId} />
        </section>
      </div>
    </main>
  );
}
