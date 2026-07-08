"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

/**
 * Phase 21 (21-07) — revision history accordion (21-UI-SPEC §Revision
 * History). Renders below the model viewer only when meshy_revisions rows
 * exist for this generation; most-recent-first, collapsed to the newest 3
 * with a "Show all (N)" toggle beyond that (accordion, not infinite scroll).
 */

export interface AdminMeshyRevisionHistoryEntry {
  id: string;
  revisionNumber: number;
  endpointUsed: string;
  changeNote: string | null;
  createdAt: string;
}

const ENDPOINT_LABEL: Record<string, string> = {
  retexture: "Retexture",
  regenerate: "Regenerate",
};

const VISIBLE_COUNT = 3;

export function AdminMeshyRevisionHistory({
  revisions,
}: {
  revisions: AdminMeshyRevisionHistoryEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (revisions.length === 0) return null;

  const sorted = [...revisions].sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return diff !== 0 ? diff : b.revisionNumber - a.revisionNumber;
  });

  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_COUNT);
  const hasMore = sorted.length > VISIBLE_COUNT;

  return (
    <section className="rounded-2xl bg-white p-5 space-y-3">
      <h2 className="font-[var(--font-heading)] text-lg" style={{ color: BRAND.ink }}>
        Revision History
      </h2>
      <ul className="space-y-3">
        {visible.map((rev) => (
          <li key={rev.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <p className="text-sm font-semibold" style={{ color: BRAND.ink }}>
              Revision {rev.revisionNumber} · {ENDPOINT_LABEL[rev.endpointUsed] ?? rev.endpointUsed}
              {" · "}
              {new Date(rev.createdAt).toLocaleDateString("en-MY", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
            {rev.changeNote ? (
              <p className="mt-1 text-sm text-slate-600">{rev.changeNote}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-semibold underline"
          style={{ color: BRAND.blue }}
        >
          {expanded ? "Show less" : `Show all (${sorted.length})`}
        </button>
      ) : null}
    </section>
  );
}
