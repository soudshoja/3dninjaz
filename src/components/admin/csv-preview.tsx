"use client";

import { useEffect, useState, useTransition } from "react";
import { previewCsv, commitCsvImport } from "@/actions/admin-bulk-import";
import { BRAND } from "@/lib/brand";
import { CsvCommitReport } from "@/components/admin/csv-commit-report";

type Preview = Awaited<ReturnType<typeof previewCsv>>;

type CommitState = Awaited<ReturnType<typeof commitCsvImport>>;

export function CsvPreview({ fileName }: { fileName: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<"valid" | "invalid">("valid");
  const [pendingPreview, startPreview] = useTransition();
  const [pendingCommit, startCommit] = useTransition();
  const [commit, setCommit] = useState<CommitState | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    startPreview(async () => {
      const res = await previewCsv(fileName);
      setPreview(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  if (pendingPreview && !preview) {
    return <p className="text-sm text-slate-600">Parsing CSV…</p>;
  }
  if (!preview || !preview.ok) {
    return (
      <p
        role="alert"
        className="rounded-xl px-3 py-2 text-sm"
        style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
      >
        {preview && !preview.ok ? preview.error : "Could not parse CSV"}
      </p>
    );
  }

  const { result } = preview;

  const onCommit = () => {
    setConfirmOpen(false);
    startCommit(async () => {
      const res = await commitCsvImport(fileName);
      setCommit(res);
    });
  };

  if (commit) {
    return <CsvCommitReport commit={commit} />;
  }

  const validCount = result.summary.valid;
  const invalidCount = result.summary.invalid;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div
          className="rounded-2xl bg-white p-4 border-2"
          style={{ borderColor: `${BRAND.ink}22` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            TOTAL
          </p>
          <p className="text-2xl font-bold">{result.summary.total}</p>
        </div>
        <div
          className="rounded-2xl bg-white p-4 border-2"
          style={{ borderColor: `${BRAND.green}66` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            VALID
          </p>
          <p className="text-2xl font-bold" style={{ color: BRAND.green }}>
            {validCount}
          </p>
        </div>
        <div
          className="rounded-2xl bg-white p-4 border-2"
          style={{ borderColor: "#dc262666" }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            INVALID
          </p>
          <p className="text-2xl font-bold" style={{ color: "#dc2626" }}>
            {invalidCount}
          </p>
        </div>
      </div>

      <div role="tablist" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "valid"}
          onClick={() => setTab("valid")}
          className="rounded-full px-4 py-2 text-sm font-semibold border-2 min-h-[40px]"
          style={{
            borderColor: tab === "valid" ? BRAND.ink : `${BRAND.ink}33`,
            backgroundColor: tab === "valid" ? BRAND.ink : "transparent",
            color: tab === "valid" ? "#ffffff" : BRAND.ink,
          }}
        >
          Valid ({validCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "invalid"}
          onClick={() => setTab("invalid")}
          className="rounded-full px-4 py-2 text-sm font-semibold border-2 min-h-[40px]"
          style={{
            borderColor: tab === "invalid" ? "#dc2626" : `${BRAND.ink}33`,
            backgroundColor: tab === "invalid" ? "#dc2626" : "transparent",
            color: tab === "invalid" ? "#ffffff" : BRAND.ink,
          }}
        >
          Invalid ({invalidCount})
        </button>
      </div>

      {tab === "valid" ? (
        <div
          className="rounded-2xl overflow-hidden bg-white"
          style={{ color: BRAND.ink }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-sm">
              <thead style={{ backgroundColor: `${BRAND.ink}0d` }}>
                <tr className="text-left">
                  <th className="p-3">Row</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Options</th>
                  <th className="p-3 text-center">Variants</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Images</th>
                </tr>
              </thead>
              <tbody>
                {result.validRows.slice(0, 100).map((v) => (
                  <tr key={v.rowIndex} className="border-t border-black/10">
                    <td className="p-3 font-mono text-xs">{v.rowIndex}</td>
                    <td className="p-3 font-semibold">{v.data.name}</td>
                    <td className="p-3 text-xs font-mono">{v.data.slug}</td>
                    <td className="p-3 text-xs">
                      {v.data.options.map((o: { name: string; values: string[] }) => (
                        <div key={o.name}>
                          <span className="font-semibold">{o.name}:</span>{" "}
                          {o.values.join(", ")}
                        </div>
                      ))}
                    </td>
                    <td className="p-3 text-xs font-mono text-center">
                      {v.data.variantCount}
                    </td>
                    <td className="p-3 text-xs">
                      {v.data.categoryId ? "Linked" : "—"}
                    </td>
                    <td className="p-3 text-xs">{v.data.images.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.validRows.length > 100 ? (
              <p className="p-3 text-xs text-slate-500">
                Showing first 100 of {result.validRows.length} valid rows.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden bg-white"
          style={{ color: BRAND.ink }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-sm">
              <thead style={{ backgroundColor: `${BRAND.ink}0d` }}>
                <tr className="text-left">
                  <th className="p-3">Row</th>
                  <th className="p-3">Errors</th>
                  <th className="p-3">Raw data</th>
                </tr>
              </thead>
              <tbody>
                {result.invalidRows.map((r) => (
                  <tr key={r.rowIndex} className="border-t border-black/10">
                    <td className="p-3 font-mono text-xs align-top">
                      {r.rowIndex}
                    </td>
                    <td className="p-3 text-xs align-top">
                      <ul className="list-disc pl-4 space-y-1">
                        {r.errors.map((e, i) => (
                          <li key={i} style={{ color: "#dc2626" }}>
                            {e}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3 text-xs font-mono whitespace-pre-wrap break-all align-top max-w-[400px]">
                      {Object.entries(r.raw)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Only valid rows will be inserted. Invalid rows are skipped.
        </p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={validCount === 0 || pendingCommit}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[60px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.green }}
        >
          {pendingCommit
            ? "Committing…"
            : `Commit ${validCount} valid row${validCount === 1 ? "" : "s"}`}
        </button>
      </div>

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6"
            style={{ color: BRAND.ink }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-2">
              Import {validCount} products?
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              This action runs in a single transaction — if any row fails the
              entire import is rolled back. Invalid rows are skipped.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
                style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onCommit}
                className="rounded-full px-6 py-3 font-bold text-white min-h-[48px]"
                style={{ backgroundColor: BRAND.green }}
              >
                Import {validCount} products
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
