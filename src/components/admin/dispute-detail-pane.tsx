import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { formatOrderNumber } from "@/lib/orders";
import type { DisputeDetail } from "@/actions/admin-disputes";

/**
 * Phase 7 (07-06) — dispute detail pane.
 *
 * Renders cached + live JSON in a readable shape. The PayPal payload has
 * arbitrary nested fields; we surface the high-signal pieces and dump the
 * rest in a collapsible <details> for completeness.
 */

type LiveDispute = {
  status?: string;
  dispute_life_cycle_stage?: string;
  reason?: string;
  dispute_amount?: { value?: string; currency_code?: string };
  create_time?: string;
  update_time?: string;
  messages?: Array<{
    posted_by?: string;
    content?: string;
    time_posted?: string;
  }>;
  evidences?: Array<{
    evidence_type?: string;
    evidence_info?: { tracking_info?: unknown[] };
    notes?: string;
    source?: string;
    date?: string;
  }>;
};

export function DisputeDetailPane({ detail }: { detail: DisputeDetail }) {
  const live = (detail.live ?? {}) as LiveDispute;
  const cached = detail.cached;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-4 md:p-6">
        <h2 className="font-[var(--font-heading)] text-xl mb-3">
          Dispute summary
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Cell label="Status">
            <strong>{live.status ?? cached.status}</strong>
          </Cell>
          <Cell label="Lifecycle stage">
            {live.dispute_life_cycle_stage ?? "—"}
          </Cell>
          <Cell label="Reason">{live.reason ?? cached.reason ?? "—"}</Cell>
          <Cell label="Amount">
            <span className="font-mono">
              {cached.amount ? formatMYR(cached.amount) : "—"}{" "}
              {cached.currency ?? ""}
            </span>
          </Cell>
          <Cell label="Created">
            {new Date(cached.createDate).toLocaleString("en-MY")}
          </Cell>
          <Cell label="Updated">
            {new Date(cached.updateDate).toLocaleString("en-MY")}
          </Cell>
          <Cell label="Last synced">
            {new Date(cached.lastSyncedAt).toLocaleString("en-MY")}
          </Cell>
          <Cell label="Linked order">
            {detail.order ? (
              <Link
                href={`/admin/orders/${detail.order.id}`}
                className="underline decoration-dotted"
              >
                {formatOrderNumber(detail.order.id)}
              </Link>
            ) : (
              <span className="text-xs text-amber-700">Not mapped</span>
            )}
          </Cell>
        </div>
      </section>

      {Array.isArray(live.messages) && live.messages.length > 0 ? (
        <section className="rounded-2xl bg-white p-4 md:p-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-3">
            Conversation thread
          </h2>
          <ul className="space-y-3">
            {live.messages.map((m, i) => (
              <li
                key={i}
                className="rounded-md border border-[var(--color-brand-border)] p-3"
                style={{
                  backgroundColor:
                    m.posted_by === "BUYER" ? "#f0f9ff" : "#f7fdf2",
                }}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span className="font-medium">{m.posted_by ?? "—"}</span>
                  <span>
                    {m.time_posted
                      ? new Date(m.time_posted).toLocaleString("en-MY")
                      : "—"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">
                  {m.content ?? "(no content)"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {Array.isArray(live.evidences) && live.evidences.length > 0 ? (
        <section className="rounded-2xl bg-white p-4 md:p-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-3">
            Evidence
          </h2>
          <ul className="space-y-2">
            {live.evidences.map((e, i) => (
              <li
                key={i}
                className="rounded-md border border-[var(--color-brand-border)] p-3 text-sm"
              >
                <p className="font-medium">{e.evidence_type ?? "—"}</p>
                {e.notes ? (
                  <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">
                    {e.notes}
                  </p>
                ) : null}
                {e.source ? (
                  <p className="mt-1 text-[10px] text-slate-500 uppercase">
                    {e.source}
                    {e.date
                      ? ` · ${new Date(e.date).toLocaleDateString("en-MY")}`
                      : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="rounded-2xl bg-white p-4 md:p-6">
        <summary className="cursor-pointer font-medium text-sm">
          Raw PayPal payload
        </summary>
        <pre
          className="mt-3 overflow-x-auto rounded-md p-3 text-[11px] leading-tight"
          style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
        >
          {JSON.stringify(detail.live ?? {}, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--color-brand-border)] p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}
