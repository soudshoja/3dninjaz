"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, XCircle } from "lucide-react";
import { commitCostImport, previewCostImport } from "@/actions/product-cost-import";
import { Button } from "@/components/ui/button";
import { buildCostReportCsv } from "@/lib/product-cost-import-parse";
import { formatPct, formatRm } from "@/lib/product-cost-math";
import type {
  CostImportCommitResult,
  CostImportPreview,
  CostImportRow,
} from "@/lib/product-cost-types";

type Filter = "all" | "update" | "warnings" | "error";

function downloadText(fileName: string, text: string, mime = "text/csv;charset=utf-8") {
  // BOM so Excel opens UTF-8 names correctly.
  const blob = new Blob(["﻿", text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const ACTION_LABEL: Record<CostImportRow["action"], string> = {
  update: "Will update",
  unchanged: "No change",
  skip: "Blank, skipped",
  error: "Error",
};

/**
 * Bulk cost import: choose a file, run a dry run, read the old to new table,
 * download the report, then commit. The file is re-read and re-validated on
 * the server both times.
 */
export function CostsImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [backfill, setBackfill] = useState(false);
  const [preview, setPreview] = useState<CostImportPreview | null>(null);
  const [result, setResult] = useState<CostImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirming(false);
    setFilter("all");
    if (inputRef.current) inputRef.current.value = "";
  }

  function buildForm(): FormData | null {
    if (!file) return null;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("backfill", backfill ? "1" : "0");
    return fd;
  }

  function check() {
    const fd = buildForm();
    if (!fd) return;
    setError(null);
    setResult(null);
    setConfirming(false);
    startTransition(async () => {
      const res = await previewCostImport(fd);
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setPreview(res);
      setFilter("all");
    });
  }

  function commit() {
    const fd = buildForm();
    if (!fd) return;
    setError(null);
    startTransition(async () => {
      const res = await commitCostImport(fd);
      setConfirming(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      setPreview(null);
    });
  }

  function downloadDryRunReport() {
    if (!preview) return;
    downloadText(
      "cost-import-dry-run.csv",
      buildCostReportCsv(
        preview.rows.map((r) => ({
          productId: r.productId,
          name: r.productName ?? r.sheetName,
          oldCost: r.oldCost,
          oldCostPerExtra: r.oldCostPerExtra,
          newCost: r.newCost,
          newCostPerExtra: r.newCostPerExtra,
          note: `${ACTION_LABEL[r.action]}${
            r.issues.length ? ": " + r.issues.map((i) => i.message).join("; ") : ""
          }`,
        })),
      ),
    );
  }

  function downloadOldValues() {
    if (!result || !result.ok) return;
    downloadText(
      "cost-import-old-values.csv",
      buildCostReportCsv(
        result.changes.map((c) => ({
          productId: c.productId,
          name: c.name,
          oldCost: c.oldCost,
          oldCostPerExtra: c.oldCostPerExtra,
          newCost: c.newCost,
          newCostPerExtra: c.newCostPerExtra,
        })),
      ),
    );
  }

  const rows = preview?.rows ?? [];
  const shown = rows.filter((r) => {
    if (filter === "update") return r.action === "update";
    if (filter === "error") return r.action === "error";
    if (filter === "warnings") return r.issues.some((i) => i.level === "warning");
    return true;
  });
  const willChange = preview?.counts.update ?? 0;
  const canCommit =
    !!preview && (willChange > 0 || (preview.backfill.requested && preview.backfill.filled > 0));

  return (
    <div className="space-y-5">
      {/* Step 1: file */}
      <section className="space-y-3 rounded-xl border border-[var(--color-brand-border)] bg-white p-4 md:p-6">
        <h2 className="font-heading text-lg">1. Choose your cost sheet</h2>
        <p className="max-w-2xl text-sm text-[var(--color-brand-text-muted)]">
          Use the 3D Ninjaz product cost template (.xlsx) or a CSV with the same
          columns. Products are matched by Product ID in column A. Cost is column
          G; keychains also use column H for the cost of each extra keycap. A
          blank cost is skipped.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="cost-file"
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-sm font-medium hover:bg-muted"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            {file ? "Choose a different file" : "Choose a file"}
          </label>
          <input
            id="cost-file"
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
              setError(null);
              setConfirming(false);
            }}
          />
          {file && (
            <span className="text-sm tabular-nums text-[var(--color-brand-text-muted)]">
              {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
            </span>
          )}
        </div>

        <label className="flex max-w-2xl cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-brand-border)] p-3">
          <input
            type="checkbox"
            checked={backfill}
            onChange={(e) => {
              setBackfill(e.target.checked);
              setPreview(null);
              setConfirming(false);
            }}
            className="mt-0.5 h-5 w-5 accent-[var(--color-brand-blue)]"
          />
          <span className="text-sm">
            <span className="font-medium">Also fill old order lines</span>
            <span className="block text-[var(--color-brand-text-muted)]">
              Gives past order lines that have no cost an estimated cost from these
              product costs, so gross margin covers old sales too. Lines whose cost
              was set when the order was placed, or typed by hand, are never changed.
            </span>
          </span>
        </label>

        <Button
          type="button"
          onClick={check}
          disabled={!file || pending}
          className="h-11 gap-2 bg-[var(--color-brand-ink)] px-5 text-white hover:bg-[var(--color-brand-ink)]/90"
        >
          {pending && !confirming ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Check file (nothing is saved yet)
        </Button>
      </section>

      {error && (
        <p
          className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Step 2: dry run */}
      {preview && (
        <section className="space-y-4 rounded-xl border border-[var(--color-brand-border)] bg-white p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg">2. Check the changes</h2>
            <Button
              type="button"
              variant="outline"
              onClick={downloadDryRunReport}
              className="h-11 gap-2 md:h-9"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download this report
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm tabular-nums sm:grid-cols-5">
            {[
              ["Will update", preview.counts.update],
              ["No change", preview.counts.unchanged],
              ["Blank, skipped", preview.counts.skip],
              ["Errors", preview.counts.error],
              ["Warnings", preview.counts.warnings],
            ].map(([label, n]) => (
              <div
                key={label as string}
                className="rounded-lg border border-[var(--color-brand-border)] px-3 py-2"
              >
                <dt className="text-xs text-[var(--color-brand-text-muted)]">{label}</dt>
                <dd className="text-lg font-semibold">{n}</dd>
              </div>
            ))}
          </dl>

          {preview.backfill.requested && (
            <p className="text-sm tabular-nums">
              Old order lines: <strong>{preview.backfill.filled}</strong> would get an
              estimated cost
              {preview.backfill.unparsable.length > 0
                ? `, ${preview.backfill.unparsable.length} keychain lines stay empty because the keycap count could not be read`
                : ""}
              .
            </p>
          )}
          {preview.counts.error > 0 && (
            <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Rows with errors are skipped. Fix them in the file and import again, or
              import the rest now.
            </p>
          )}

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rows">
            {(
              [
                ["all", `All (${rows.length})`],
                ["update", `Will update (${preview.counts.update})`],
                ["warnings", "With warnings"],
                ["error", `Errors (${preview.counts.error})`],
              ] as Array<[Filter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium md:h-9 " +
                  (filter === key
                    ? "border-[var(--color-brand-ink)] bg-[var(--color-brand-ink)] text-white"
                    : "border-[var(--color-brand-border)] bg-white hover:bg-muted")
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[60vh] overflow-auto rounded-md border border-[var(--color-brand-border)]">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 bg-muted/70 text-left text-xs text-[var(--color-brand-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Cost before</th>
                  <th className="px-3 py-2 text-right font-medium">Cost after</th>
                  <th className="px-3 py-2 text-right font-medium">Margin after</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[var(--color-brand-text-muted)]">
                      No rows in this view.
                    </td>
                  </tr>
                )}
                {shown.map((r) => (
                  <tr
                    key={`${r.rowNumber}-${r.productId}`}
                    className="border-t border-[var(--color-brand-border)] align-top"
                  >
                    <td className="px-3 py-2 text-[var(--color-brand-text-muted)]">{r.rowNumber}</td>
                    <td className="max-w-[260px] px-3 py-2 font-sans">
                      <p className="break-words font-medium">
                        {r.productName ?? (r.sheetName || "Unknown product")}
                      </p>
                      {r.productType && (
                        <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-muted)]">
                          {r.optionKey ? `${r.productType} option` : r.productType}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.oldCost === null ? "-" : formatRm(r.oldCost)}
                      {r.productType === "keychain" && r.oldCostPerExtra !== null && (
                        <span className="block text-xs text-[var(--color-brand-text-muted)]">
                          +{formatRm(r.oldCostPerExtra)} per extra
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.action === "update" || r.action === "unchanged" ? (
                        <>
                          {formatRm(r.newCost ?? r.oldCost)}
                          {r.productType === "keychain" &&
                            (r.newCostPerExtra ?? r.oldCostPerExtra) !== null && (
                              <span className="block text-xs font-normal text-[var(--color-brand-text-muted)]">
                                +{formatRm(r.newCostPerExtra ?? r.oldCostPerExtra)} per extra
                              </span>
                            )}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.action === "update" || r.action === "unchanged"
                        ? formatPct(r.newMarginPct)
                        : "-"}
                    </td>
                    <td className="px-3 py-2 font-sans">
                      <span
                        className={
                          "text-xs font-medium " +
                          (r.action === "error"
                            ? "text-red-700"
                            : r.action === "update"
                              ? "text-green-700"
                              : "text-[var(--color-brand-text-muted)]")
                        }
                      >
                        {ACTION_LABEL[r.action]}
                      </span>
                      {r.issues.map((i, idx) => (
                        <p
                          key={idx}
                          className={
                            "flex items-start gap-1 text-xs " +
                            (i.level === "error" ? "text-red-700" : "text-amber-800")
                          }
                        >
                          {i.level === "error" ? (
                            <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                          )}
                          {i.message}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Step 3: commit */}
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-brand-border)] pt-4">
            {!confirming ? (
              <Button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!canCommit || pending}
                className="h-11 bg-[var(--color-brand-ink)] px-5 text-white hover:bg-[var(--color-brand-ink)]/90"
              >
                {willChange > 0
                  ? `Import ${willChange} ${willChange === 1 ? "cost" : "costs"}`
                  : "Fill old order lines"}
              </Button>
            ) : (
              <>
                <p className="text-sm">
                  Save {willChange} {willChange === 1 ? "cost" : "costs"}
                  {preview.backfill.requested
                    ? ` and fill ${preview.backfill.filled} old order lines`
                    : ""}
                  ? This is saved as one change.
                </p>
                <Button
                  type="button"
                  onClick={commit}
                  disabled={pending}
                  className="h-11 gap-2 bg-[var(--color-brand-ink)] px-5 text-white hover:bg-[var(--color-brand-ink)]/90"
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {pending ? "Importing..." : "Yes, import"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="h-11"
                >
                  Cancel
                </Button>
              </>
            )}
            {!canCommit && (
              <p className="text-sm text-[var(--color-brand-text-muted)]">
                Nothing to import. Fill in costs in the file and check it again.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Result */}
      {result && result.ok && (
        <section
          className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4 md:p-6"
          role="status"
        >
          <h2 className="font-heading text-lg text-green-900">Import finished</h2>
          <p className="text-sm tabular-nums text-green-900">
            {result.updated} {result.updated === 1 ? "cost" : "costs"} saved,{" "}
            {result.unchanged} unchanged, {result.skipped} blank, {result.errors} skipped
            with errors.
          </p>
          {result.backfill.requested && (
            <div className="text-sm text-green-900">
              <p className="tabular-nums">
                {result.backfill.filled} old order lines got an estimated cost.
              </p>
              {result.backfill.unparsable.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">
                    {result.backfill.unparsable.length} keychain lines left empty (keycap count
                    unreadable)
                  </summary>
                  <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-auto pl-5">
                    {result.backfill.unparsable.map((u) => (
                      <li key={u.orderItemId}>
                        {u.productName} <span className="text-xs">({u.orderItemId.slice(0, 8)})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={downloadOldValues}
              disabled={result.changes.length === 0}
              className="h-11 gap-2 bg-white md:h-9"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download old values
            </Button>
            <Button type="button" variant="outline" onClick={reset} className="h-11 bg-white md:h-9">
              Import another file
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
