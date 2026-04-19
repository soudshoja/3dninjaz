import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  listAdminReviews,
  type ReviewStatusFilter as Filter,
} from "@/actions/admin-reviews";
import { BRAND } from "@/lib/brand";
import { ReviewRow } from "@/components/admin/review-row";
import { ReviewStatusFilter } from "@/components/admin/review-status-filter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Reviews",
  robots: { index: false, follow: false },
};

const VALID: Filter[] = ["pending", "approved", "hidden", "all"];

type PageProps = { searchParams: Promise<{ status?: string }> };

/**
 * /admin/reviews moderation queue (Plan 05-07 / ADM-12, REV-01).
 *
 * Default filter is 'pending' so the queue greets the admin with the work
 * that needs doing. Storefront customer review submission UI lands in
 * Phase 6 06-05 — until then the table is mostly empty (or seeded for QA).
 */
export default async function AdminReviewsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: Filter = (
    VALID.includes(sp.status as Filter) ? sp.status : "pending"
  ) as Filter;
  const rows = await listAdminReviews(filter);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Review moderation
            </h1>
            <p className="mt-1 text-slate-600">
              {rows.length} {rows.length === 1 ? "review" : "reviews"} ·
              filter: <strong>{filter}</strong>
            </p>
          </div>
        </header>

        <div className="mb-4">
          <ReviewStatusFilter current={filter} />
        </div>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">
              No {filter === "all" ? "" : filter} reviews yet.
            </p>
            <p className="text-sm text-slate-600">
              Customer-submitted reviews will appear here for moderation as
              they come in.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-sm">
                <thead style={{ backgroundColor: `${BRAND.ink}0d` }}>
                  <tr className="text-left">
                    <th className="p-3">Product</th>
                    <th className="p-3">Reviewer</th>
                    <th className="p-3">Rating</th>
                    <th className="p-3">Body</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <ReviewRow key={r.id} review={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
