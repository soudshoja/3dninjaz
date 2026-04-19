"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import type { commitCsvImport } from "@/actions/admin-bulk-import";

type CommitState = Awaited<ReturnType<typeof commitCsvImport>>;

export function CsvCommitReport({ commit }: { commit: CommitState }) {
  if (!commit.ok) {
    return (
      <p
        role="alert"
        className="rounded-xl px-3 py-2 text-sm"
        style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
      >
        {commit.error}
      </p>
    );
  }

  const { successes, failures } = commit.results;
  const json = JSON.stringify(commit.results, null, 2);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const failureCount = failures.length;

  return (
    <div className="space-y-4" style={{ color: BRAND.ink }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-2xl bg-white p-4 border-2"
          style={{ borderColor: `${BRAND.green}66` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            IMPORTED
          </p>
          <p className="text-3xl font-bold" style={{ color: BRAND.green }}>
            {successes.length}
          </p>
        </div>
        <div
          className="rounded-2xl bg-white p-4 border-2"
          style={{ borderColor: failureCount > 0 ? "#dc262666" : `${BRAND.ink}22` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            FAILED
          </p>
          <p
            className="text-3xl font-bold"
            style={{ color: failureCount > 0 ? "#dc2626" : BRAND.ink }}
          >
            {failureCount}
          </p>
        </div>
      </div>

      {successes.length > 0 ? (
        <section
          className="rounded-2xl bg-white p-4"
          style={{ color: BRAND.ink }}
        >
          <h3 className="font-semibold mb-2">Imported slugs</h3>
          <ul className="text-xs font-mono space-y-1 max-h-60 overflow-y-auto">
            {successes.map((s) => (
              <li key={s}>
                <Link
                  href={`/products/${s}`}
                  className="underline decoration-dotted"
                  style={{ color: BRAND.ink }}
                >
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {failureCount > 0 ? (
        <section
          className="rounded-2xl bg-white p-4"
          style={{ color: BRAND.ink }}
        >
          <h3 className="font-semibold mb-2">Failures</h3>
          <ul className="text-xs space-y-1">
            {failures.map((f, i) => (
              <li key={i}>
                <span className="font-mono">Row {f.row}:</span>{" "}
                <span style={{ color: "#dc2626" }}>{f.error}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Note: when any row fails the entire transaction is rolled back —
            no rows were committed.
          </p>
        </section>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={dataUrl}
          download="import-report.json"
          className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px] inline-flex items-center justify-center"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        >
          Download report (JSON)
        </a>
        <Link
          href="/admin/products"
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] inline-flex items-center justify-center"
          style={{ backgroundColor: BRAND.ink }}
        >
          Go to products
        </Link>
      </div>
    </div>
  );
}
