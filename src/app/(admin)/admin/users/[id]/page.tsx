import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAdminUserDetail } from "@/actions/admin-user-detail";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import {
  NotesEditor,
  TagsEditor,
  InlineSuspendButton,
} from "./user-crm-client";
import { AdminOrderStatusBadge } from "@/components/admin/admin-order-status-badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Customer detail",
  robots: { index: false, follow: false },
};

// ────────────────────────────────────────────────────────────────────────────
// Lifecycle chip colours
// ────────────────────────────────────────────────────────────────────────────

const LIFECYCLE_COLORS: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  vip: { bg: BRAND.green, text: "#fff", label: "VIP" },
  active: { bg: "#16a34a", text: "#fff", label: "Active" },
  at_risk: { bg: "#d97706", text: "#fff", label: "At risk" },
  dormant: { bg: "#64748b", text: "#fff", label: "Dormant" },
  new: { bg: "#3b82f6", text: "#fff", label: "New" },
  lead: { bg: "#94a3b8", text: "#fff", label: "Lead" },
};

function LifecycleChip({ stage }: { stage: string }) {
  const c = LIFECYCLE_COLORS[stage] ?? LIFECYCLE_COLORS.lead;
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const u = await getAdminUserDetail(id);
  if (!u) notFound();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {/* Back nav */}
        <nav className="text-sm">
          <Link href="/admin/users" className="underline decoration-dotted">
            &larr; All users
          </Link>
        </nav>

        {/* ── Header card ── */}
        <section
          className="rounded-2xl p-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="font-[var(--font-heading)] text-2xl md:text-3xl">
                  {u.name || "—"}
                </h1>
                {u.pdpaConsentAt ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: BRAND.blue }}
                  >
                    PDPA verified
                  </span>
                ) : null}
                <LifecycleChip stage={u.stats.lifecycleStage} />
              </div>

              {/* Email */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <p className="text-sm text-slate-600">{u.email}</p>
                {u.isSentinelEmail ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ backgroundColor: "#fef08a", color: "#713f12" }}
                  >
                    Sentinel email — customer won&apos;t get notifications
                  </span>
                ) : null}
              </div>

              {/* Phone */}
              {u.phone ? (
                <p className="mt-1 text-sm">
                  <a
                    href={`tel:${u.phone}`}
                    className="underline decoration-dotted"
                    style={{ color: BRAND.blue }}
                  >
                    {u.phone}
                  </a>
                </p>
              ) : null}

              {/* Registered / last order */}
              <p className="mt-2 text-xs text-slate-500">
                Registered{" "}
                {new Date(u.createdAt).toLocaleDateString("en-MY", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                {u.stats.lastOrderAt ? (
                  <>
                    {" · "}Last order{" "}
                    {new Date(u.stats.lastOrderAt).toLocaleDateString("en-MY", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </>
                ) : null}
              </p>
            </div>

            {/* Suspend toggle */}
            <InlineSuspendButton
              userId={u.id}
              banned={u.banned}
              banReason={u.banReason}
              userName={u.name || u.email}
            />
          </div>
        </section>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Lifetime spend",
              value:
                u.stats.lifetimeSpend > 0
                  ? formatMYR(u.stats.lifetimeSpend)
                  : "—",
            },
            { label: "Orders", value: String(u.stats.orderCount) },
            {
              label: "Avg order",
              value:
                u.stats.avgOrderValue > 0
                  ? formatMYR(u.stats.avgOrderValue)
                  : "—",
            },
            {
              label: "Lifecycle",
              value:
                LIFECYCLE_COLORS[u.stats.lifecycleStage]?.label ??
                u.stats.lifecycleStage,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl p-4"
              style={{ backgroundColor: "#ffffff" }}
            >
              <p className="text-xs text-slate-500 mb-1">{stat.label}</p>
              <p className="font-bold text-lg">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ── Addresses ── */}
        <section
          className="rounded-2xl p-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2 className="font-[var(--font-heading)] text-lg mb-4">
            Saved addresses
          </h2>
          {u.addresses.length === 0 ? (
            <p className="text-sm text-slate-500">No saved addresses.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {u.addresses.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border p-3 text-sm"
                  style={{ borderColor: `${BRAND.ink}1a` }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{a.fullName}</span>
                    {a.isDefault ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: `${BRAND.ink}0d`,
                          color: BRAND.ink,
                        }}
                      >
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className="text-slate-600">{a.phone}</p>
                  <p className="text-slate-600">
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}
                  </p>
                  <p className="text-slate-600">
                    {a.city}, {a.state} {a.postcode}
                  </p>
                  <p className="text-slate-600">{a.country}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Notes ── */}
        <section
          className="rounded-2xl p-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2 className="font-[var(--font-heading)] text-lg mb-4">
            Admin notes
          </h2>
          <NotesEditor userId={u.id} initialNotes={u.notes} />
        </section>

        {/* ── Tags ── */}
        <section
          className="rounded-2xl p-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2 className="font-[var(--font-heading)] text-lg mb-4">Tags</h2>
          <TagsEditor userId={u.id} initialTags={u.tags} />
        </section>

        {/* ── Recent orders ── */}
        <section
          className="rounded-2xl p-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2 className="font-[var(--font-heading)] text-lg mb-4">
            Recent orders
          </h2>
          {u.recentOrders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[560px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-xs"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Order</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {u.recentOrders.map((o) => (
                    <tr key={o.id} className="border-t border-black/10">
                      <td className="p-3">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-semibold hover:underline font-mono text-xs"
                          style={{ color: BRAND.blue }}
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="p-3">
                        <AdminOrderStatusBadge
                          status={o.status as Parameters<typeof AdminOrderStatusBadge>[0]["status"]}
                        />
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {formatMYR(o.totalAmount)}
                      </td>
                      <td className="p-3 text-slate-500 whitespace-nowrap text-xs">
                        {new Date(o.createdAt).toLocaleDateString("en-MY", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
