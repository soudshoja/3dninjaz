import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  getSubscriberCounts,
  listSubscribers,
} from "@/actions/admin-subscribers";
import {
  isValidSubscriberFilter,
  type SubscriberStatusFilter,
} from "@/lib/subscriber-filters";
import { BRAND } from "@/lib/brand";
import { SubscriberRowActions } from "@/components/admin/subscriber-row-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Subscribers",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 100;

type PageProps = {
  searchParams: Promise<{ status?: string; page?: string }>;
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const iso = new Date(d).toISOString();
  // YYYY-MM-DD HH:MM (UTC) — short for dense table rows.
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/**
 * /admin/subscribers — newsletter audience management.
 *
 * - Default filter: `active` (what most admins care about).
 * - Pagination: 100 per page. Query string drives both filter + page so
 *   bookmarks survive reloads.
 * - Export CSV button links to /api/admin/subscribers/export with the same
 *   status filter applied.
 */
export default async function AdminSubscribersPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;

  const filter: SubscriberStatusFilter = isValidSubscriberFilter(sp.status)
    ? sp.status
    : "active";
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, counts] = await Promise.all([
    listSubscribers(filter, PAGE_SIZE, offset),
    getSubscriberCounts(),
  ]);

  const total =
    filter === "all"
      ? counts.all
      : filter === "active"
        ? counts.active
        : filter === "unsubscribed"
          ? counts.unsubscribed
          : counts.bounced;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportHref = `/api/admin/subscribers/export?status=${filter}`;

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Email subscribers
            </h1>
            <p className="mt-1 text-slate-600">
              {counts.active} active · {counts.unsubscribed} unsubscribed
              {counts.bounced > 0 ? ` · ${counts.bounced} bounced` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportHref}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: BRAND.blue }}
            >
              Export CSV
            </a>
          </div>
        </header>

        {/* Filter pill group */}
        <nav
          aria-label="Filter subscribers"
          className="mb-4 flex flex-wrap gap-2"
        >
          {(
            [
              { key: "active", label: `Active (${counts.active})` },
              {
                key: "unsubscribed",
                label: `Unsubscribed (${counts.unsubscribed})`,
              },
              { key: "bounced", label: `Bounced (${counts.bounced})` },
              { key: "all", label: `All (${counts.all})` },
            ] as Array<{ key: SubscriberStatusFilter; label: string }>
          ).map((f) => {
            const active = f.key === filter;
            return (
              <Link
                key={f.key}
                href={`/admin/subscribers?status=${f.key}`}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: active ? BRAND.ink : "#ffffff",
                  color: active ? "#ffffff" : BRAND.ink,
                  border: active ? "none" : "1px solid #e4e4e7",
                }}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">
              No {filter === "all" ? "" : filter} subscribers yet.
            </p>
            <p className="text-sm text-slate-600">
              Subscribers signed up via the footer form will appear here.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead style={{ backgroundColor: `${BRAND.ink}0d` }}>
                  <tr className="text-left">
                    <th className="p-3">Email</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Subscribed</th>
                    <th className="p-3">Unsubscribed</th>
                    <th className="p-3">User</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100">
                      <td className="p-3 font-mono text-xs">{r.email}</td>
                      <td className="p-3 text-xs text-zinc-600">
                        {r.source || "—"}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="p-3 text-xs text-zinc-600">
                        {fmtDate(r.subscribedAt)}
                      </td>
                      <td className="p-3 text-xs text-zinc-600">
                        {fmtDate(r.unsubscribedAt)}
                      </td>
                      <td className="p-3 text-xs text-zinc-500">
                        {r.userId ? (
                          <code className="rounded bg-zinc-100 px-1.5 py-0.5">
                            {r.userId.slice(0, 8)}…
                          </code>
                        ) : (
                          "guest"
                        )}
                      </td>
                      <td className="p-3">
                        <SubscriberRowActions id={r.id} status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-zinc-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={`/admin/subscribers?status=${filter}&page=${page - 1}`}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-semibold"
                >
                  ← Prev
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  href={`/admin/subscribers?status=${filter}&page=${page + 1}`}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-semibold"
                >
                  Next →
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function StatusBadge({
  status,
}: {
  status: "active" | "unsubscribed" | "bounced";
}) {
  const map = {
    active: { bg: "#16a34a1a", color: "#166534", label: "Active" },
    unsubscribed: { bg: "#f4f4f5", color: "#52525b", label: "Unsubscribed" },
    bounced: { bg: "#fef2f2", color: "#991b1b", label: "Bounced" },
  } as const;
  const s = map[status];
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}
