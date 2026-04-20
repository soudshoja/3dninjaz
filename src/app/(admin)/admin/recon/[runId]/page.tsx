import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getReconRun } from "@/actions/admin-recon";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Reconciliation run",
  robots: { index: false, follow: false },
};

type DriftItem = {
  kind:
    | "missing_local"
    | "missing_paypal"
    | "amount_mismatch"
    | "refund_only_external";
  localOrderId?: string;
  paypalTxnId?: string;
  captureId?: string;
  localTotal?: number;
  paypalGross?: number;
};

const KIND_DESCRIPTIONS: Record<DriftItem["kind"], string> = {
  missing_local:
    "PayPal recorded a transaction we have no local order for. Likely a payment outside the storefront flow or a webhook miss.",
  missing_paypal:
    "Local order has a paypalCaptureId but PayPal Reporting did not return it. Likely a settle delay; check PayPal dashboard manually.",
  amount_mismatch:
    "Local total and PayPal gross differ by > RM 0.02.",
  refund_only_external:
    "PayPal status is REFUNDED but local refundedAmount is 0. Refund happened on PayPal directly without going through admin/refund.",
};

export default async function AdminReconDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  await requireAdmin();
  const { runId } = await params;
  const row = await getReconRun(runId);
  if (!row) notFound();

  let drift: DriftItem[] = [];
  try {
    drift = row.driftJson ? (JSON.parse(row.driftJson) as DriftItem[]) : [];
  } catch {
    drift = [];
  }
  const grouped = drift.reduce<Record<string, DriftItem[]>>((acc, d) => {
    (acc[d.kind] ??= []).push(d);
    return acc;
  }, {});

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <nav className="mb-4 text-sm">
          <Link href="/admin/recon" className="underline decoration-dotted">
            &larr; All runs
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Recon {row.runDate}
          </h1>
          <p className="mt-1 text-slate-600">
            Status: <strong>{row.status}</strong> · Drift: {row.driftCount} ·
            PayPal: {row.totalPaypalTxns} · Local: {row.totalLocalTxns} · Ran{" "}
            {new Date(row.ranAt).toLocaleString("en-MY")}
          </p>
          {row.errorMessage ? (
            <p className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {row.errorMessage}
            </p>
          ) : null}
        </header>

        {drift.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold text-green-800 mb-2">
              No drift.
            </p>
            <p className="text-sm text-slate-600">
              Local and PayPal records reconcile exactly for this date.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([kind, items]) => (
              <section
                key={kind}
                className="rounded-2xl bg-white p-4 md:p-6"
              >
                <header className="mb-2">
                  <h2 className="font-[var(--font-heading)] text-xl">
                    {kind.replace(/_/g, " ")} ({items.length})
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    {KIND_DESCRIPTIONS[kind as DriftItem["kind"]]}
                  </p>
                </header>
                <ul className="space-y-2">
                  {items.map((d, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-[var(--color-brand-border)] p-3 text-sm"
                    >
                      <code className="text-xs break-all">
                        {JSON.stringify(d)}
                      </code>
                      {d.localOrderId ? (
                        <p className="mt-2">
                          <Link
                            href={`/admin/orders/${d.localOrderId}`}
                            className="underline decoration-dotted text-xs"
                          >
                            Open order →
                          </Link>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
