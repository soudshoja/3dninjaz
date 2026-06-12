import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  listAdminReviews,
  type ReviewStatusFilter as Filter,
} from "@/actions/admin-reviews";
import { BRAND } from "@/lib/brand";
import { ReviewRow } from "@/components/admin/review-row";
import { ReviewStatusFilter } from "@/components/admin/review-status-filter";
import { ReviewRowActions } from "@/components/admin/review-row-actions";

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
            {/* ── Desktop table (md+) ── */}
            <div className="hidden md:block overflow-x-auto">
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

            {/* ── Mobile cards (below md) ── */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => {
                const statusStyle = {
                  pending: {
                    label: "Pending",
                    bg: "#fef3c7",
                    color: "#92400e",
                  },
                  approved: {
                    label: "Approved",
                    bg: "#dcfce7",
                    color: "#166534",
                  },
                  hidden: { label: "Hidden", bg: "#e2e8f0", color: "#334155" },
                }[r.status];
                const safeRating = Math.max(0, Math.min(5, r.rating));

                return (
                  <div key={r.id} className="p-4 flex flex-col gap-3">
                    {/* Product + status */}
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        {r.productSlug ? (
                          <Link
                            href={`/products/${r.productSlug}`}
                            className="font-semibold underline decoration-dotted break-words"
                            style={{ color: BRAND.ink }}
                          >
                            {r.productName}
                          </Link>
                        ) : (
                          <span className="font-semibold break-words">
                            {r.productName}
                          </span>
                        )}
                      </div>
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.color,
                        }}
                      >
                        {statusStyle.label}
                      </span>
                    </div>

                    {/* Rating + date */}
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <span
                        className="text-yellow-500 font-mono"
                        aria-label={`Rating ${safeRating} out of 5`}
                      >
                        {"★".repeat(safeRating)}
                        <span className="opacity-30">
                          {"★".repeat(5 - safeRating)}
                        </span>
                      </span>
                      <span>
                        {new Date(r.createdAt).toLocaleDateString("en-MY")}
                      </span>
                    </div>

                    {/* Reviewer */}
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {r.userName}
                      </span>
                      {" · "}
                      <span className="break-words">{r.userEmail}</span>
                    </div>

                    {/* Review body */}
                    {r.body && (
                      <p
                        className="text-sm line-clamp-3 break-words"
                        style={{ color: BRAND.ink }}
                      >
                        {r.body}
                      </p>
                    )}

                    {/* Actions — same ReviewRowActions used by desktop */}
                    <ReviewRowActions row={{ id: r.id, status: r.status }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
