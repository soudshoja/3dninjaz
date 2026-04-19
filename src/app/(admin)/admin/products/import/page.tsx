"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { CsvUpload } from "@/components/admin/csv-upload";
import { CsvPreview } from "@/components/admin/csv-preview";

/**
 * /admin/products/import — three-stage flow:
 *   1) <CsvUpload> — drag-drop or file-picker, POSTs to /api/admin/bulk-import
 *      and yields a server-stored fileName.
 *   2) <CsvPreview> — calls previewCsv(fileName), shows tabs of valid /
 *      invalid rows + Commit confirm dialog.
 *   3) <CsvCommitReport> — rendered inside <CsvPreview> after commit.
 *
 * Client component because the upload + preview state lives in the browser.
 * The page itself is gated by (admin)/layout.tsx redirect; every server
 * action used downstream re-checks requireAdmin().
 */
export default function AdminBulkImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Bulk product import
          </h1>
          <p className="mt-1 text-slate-600 max-w-2xl">
            Upload a CSV to add multiple products at once. The preview step
            validates every row and lets you commit only the valid ones —
            existing products are never updated.
          </p>
        </header>

        {!fileName ? (
          <CsvUpload onUploaded={setFileName} />
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setFileName(null)}
              className="text-sm underline decoration-dotted"
              style={{ color: BRAND.ink }}
            >
              ← Upload a different file
            </button>
            <CsvPreview fileName={fileName} />
          </div>
        )}
      </div>
    </main>
  );
}
