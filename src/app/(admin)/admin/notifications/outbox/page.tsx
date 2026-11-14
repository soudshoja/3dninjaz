import type { Metadata } from "next";
import Link from "next/link";
import { Send } from "lucide-react";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { listOutbox } from "@/actions/admin-whatsapp-outbox";
import { WhatsappOutboxTable } from "@/components/admin/whatsapp-outbox-table";
import { OUTBOX_FILTERS, type OutboxFilter } from "@/lib/whatsapp/outbox-types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · WhatsApp outbox",
  robots: { index: false, follow: false },
};

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = (OUTBOX_FILTERS as readonly string[]).includes(sp.filter ?? "")
    ? (sp.filter as OutboxFilter)
    : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listOutbox({ filter, page });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <header className="mb-6 flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg"
            style={{ backgroundColor: BRAND.ink }}
          >
            <Send size={22} className="text-white" />
          </div>
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl font-extrabold tracking-tight">
              WhatsApp outbox
            </h1>
            <p className="text-sm text-slate-500">
              Every notification is queued here, retried on failure, and kept for
              audit.{" "}
              <Link
                href="/admin/notifications"
                className="underline"
                style={{ color: BRAND.blue }}
              >
                Back to templates
              </Link>
            </p>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {Object.entries(data.counts).map(([s, n]) => (
            <span key={s} className="rounded-full border bg-white px-3 py-1">
              {s}: <strong>{n}</strong>
            </span>
          ))}
        </div>

        <nav className="mb-4 flex flex-wrap gap-2 text-sm">
          {OUTBOX_FILTERS.map((f) => (
            <Link
              key={f}
              href={`/admin/notifications/outbox?filter=${f}`}
              className="rounded-full border px-3 py-1"
              style={
                f === filter
                  ? { backgroundColor: BRAND.ink, color: "#fff" }
                  : { backgroundColor: "#fff" }
              }
            >
              {f}
            </Link>
          ))}
        </nav>

        <WhatsappOutboxTable rows={data.rows} />

        <div className="mt-4 flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/notifications/outbox?filter=${filter}&page=${page - 1}`}
              className="underline"
            >
              Previous
            </Link>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={`/admin/notifications/outbox?filter=${filter}&page=${page + 1}`}
              className="underline"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
