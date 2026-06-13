import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listCheckoutDrafts, type AdminDraftRow } from "@/actions/checkout-drafts";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { DraftDismissButton } from "@/components/admin/draft-dismiss-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Checkout drafts",
  robots: { index: false, follow: false },
};

/**
 * /admin/drafts — abandoned-checkout visibility (2026-06-13). A draft row is
 * created the moment a customer types name + phone at checkout, before any
 * pay button is pressed. "open" = had a booking, didn't pay; "converted" =
 * a real order followed; "dismissed" = admin followed up / junk.
 */
export default async function AdminDraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireAdmin();
  const { show } = await searchParams;
  const showAll = show === "all";
  const all = await listCheckoutDrafts();
  const rows = showAll ? all : all.filter((d) => d.status === "open");
  const openCount = all.filter((d) => d.status === "open").length;

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Checkout drafts</h1>
          <p className="mt-1 text-slate-600">
            Customers who reached checkout (name + phone) but haven&apos;t paid.{" "}
            <strong>{openCount}</strong> open.
          </p>
        </header>

        <div className="mb-4 flex gap-2">
          <Link
            href="/admin/drafts"
            className="rounded-full px-4 py-2 text-sm font-semibold min-h-[40px] inline-flex items-center"
            style={
              !showAll
                ? { backgroundColor: BRAND.ink, color: "#ffffff" }
                : { border: `2px solid ${BRAND.ink}33` }
            }
          >
            Open
          </Link>
          <Link
            href="/admin/drafts?show=all"
            className="rounded-full px-4 py-2 text-sm font-semibold min-h-[40px] inline-flex items-center"
            style={
              showAll
                ? { backgroundColor: BRAND.ink, color: "#ffffff" }
                : { border: `2px solid ${BRAND.ink}33` }
            }
          >
            All
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#ffffff" }}>
            <p className="text-lg font-bold mb-2">
              {showAll ? "No checkout drafts yet." : "No open drafts."}
            </p>
            <p className="text-sm text-slate-600">
              A draft appears here as soon as a customer types their name and
              phone at checkout.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden divide-y divide-black/10" style={{ backgroundColor: "#ffffff" }}>
            {rows.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function StatusChip({ status }: { status: AdminDraftRow["status"] }) {
  const styles: Record<AdminDraftRow["status"], { bg: string; fg: string; label: string }> = {
    open: { bg: "#FEF3C7", fg: "#92400E", label: "Open" },
    converted: { bg: "#DCFCE7", fg: "#166534", label: "Converted to order" },
    dismissed: { bg: "#F1F5F9", fg: "#475569", label: "Dismissed" },
  };
  const s = styles[status];
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function DraftCard({ draft }: { draft: AdminDraftRow }) {
  const digits = draft.phone.replace(/\D+/g, "");
  const waDigits = digits.startsWith("60") ? digits : `60${digits.replace(/^0+/, "")}`;
  const a = draft.address;
  const addressLine = a
    ? [a.line1, a.line2, a.city, a.state, a.postcode].filter(Boolean).join(", ")
    : null;
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="font-semibold break-words">{draft.recipientName}</p>
          <p className="text-xs text-slate-600 break-words">
            {draft.phone}
            {draft.email ? ` · ${draft.email}` : ""}
          </p>
        </div>
        <StatusChip status={draft.status} />
      </div>

      {draft.items.length > 0 ? (
        <ul className="text-sm text-slate-700">
          {draft.items.map((it, i) => (
            <li key={i} className="break-words">
              {it.name} × {it.quantity} — {formatMYR(it.lineTotal)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500 italic">Bag snapshot unavailable</p>
      )}

      <p className="text-sm">
        <span className="font-bold">{formatMYR(draft.subtotal)}</span>
        <span className="text-slate-500"> subtotal (before shipping)</span>
      </p>

      {addressLine ? (
        <p className="text-xs text-slate-600 break-words">{addressLine}</p>
      ) : null}

      <p className="text-xs text-slate-500">
        Last activity {new Date(draft.updatedAt).toLocaleString("en-MY")} · started{" "}
        {new Date(draft.createdAt).toLocaleString("en-MY")}
      </p>

      {draft.status === "open" ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-4 py-2 text-sm font-semibold text-black min-h-[44px] inline-flex items-center"
            style={{ backgroundColor: "#25D366" }}
          >
            WhatsApp customer
          </a>
          <DraftDismissButton draftId={draft.id} />
        </div>
      ) : null}
    </div>
  );
}
