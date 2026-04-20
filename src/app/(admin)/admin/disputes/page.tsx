import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listDisputes, syncDisputes } from "@/actions/admin-disputes";
import { DisputeListTable } from "@/components/admin/dispute-list-table";
import { BRAND } from "@/lib/brand";
import { RefreshCcw } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Disputes",
  robots: { index: false, follow: false },
};

const STATUS_CHIPS: Array<{ key: string | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "WAITING_FOR_BUYER_RESPONSE", label: "Waiting buyer" },
  { key: "WAITING_FOR_SELLER_RESPONSE", label: "Waiting seller" },
  { key: "UNDER_REVIEW", label: "Under review" },
  { key: "RESOLVED", label: "Resolved" },
];

async function refreshDisputes() {
  "use server";
  await syncDisputes();
}

/**
 * Phase 7 (07-06) — /admin/disputes list page.
 *
 * Auto-syncs from PayPal when the cache is older than 15 min (Q-07-07).
 * Manual Refresh button forces an immediate re-sync.
 */
export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status && sp.status !== "all" ? sp.status : undefined;
  const rows = await listDisputes(status ? { status } : {});

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Disputes
            </h1>
            <p className="mt-1 text-slate-600">
              Buyer disputes mirrored from PayPal. {rows.length} total
              {status ? ` matching ${status}` : ""}.
            </p>
          </div>
          <form action={refreshDisputes}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 min-h-[48px] rounded-md px-4 text-sm font-semibold text-white"
              style={{ backgroundColor: BRAND.blue }}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </form>
        </header>

        <section
          className="rounded-2xl p-4 md:p-5 mb-4"
          style={{ backgroundColor: "#ffffff" }}
        >
          <div className="flex flex-wrap gap-2">
            {STATUS_CHIPS.map((chip) => {
              const active = chip.key === (status ?? "all");
              const href =
                chip.key === "all"
                  ? "/admin/disputes"
                  : `/admin/disputes?status=${encodeURIComponent(chip.key)}`;
              return (
                <Link
                  key={chip.key}
                  href={href}
                  className="inline-flex items-center rounded-full border px-4 min-h-[40px] text-sm font-semibold"
                  style={{
                    backgroundColor: active ? BRAND.ink : "transparent",
                    color: active ? BRAND.cream : BRAND.ink,
                    borderColor: active ? BRAND.ink : "#0B102022",
                  }}
                  aria-current={active ? "page" : undefined}
                >
                  {chip.label}
                </Link>
              );
            })}
          </div>
        </section>

        <DisputeListTable rows={rows} />
      </div>
    </main>
  );
}
