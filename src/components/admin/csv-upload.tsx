"use client";

import { useRef, useState } from "react";
import { BRAND } from "@/lib/brand";

const TEMPLATE_HEADER = [
  "name",
  "slug",
  "description",
  "category_name",
  "option1_name",
  "option1_values",
  "option1_prices",
  "option2_name",
  "option2_values",
  "option2_prices",
  "material_type",
  "estimated_production_days",
  "image_url_1",
  "image_url_2",
  "image_url_3",
];

const TEMPLATE_EXAMPLE = [
  "Sample Dragon",
  "sample-dragon",
  "Hand-printed PLA dragon, layered finish.",
  "Decor",
  "Size",
  "S|M|L",
  "29.00|59.00|99.00",
  "",
  "",
  "",
  "PLA",
  "7",
  "/uploads/products/sample-dragon-01.jpg",
  "",
  "",
];

export function CsvUpload({
  onUploaded,
}: {
  onUploaded: (fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are accepted");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large (max 5 MB)");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setProgress(0);
    try {
      // fetch doesn't expose upload progress for FormData reliably across
      // browsers without XHR. We toggle a busy state instead — files are
      // capped at 5 MB so the UX is acceptable.
      const res = await fetch("/api/admin/bulk-import", {
        method: "POST",
        body: fd,
      });
      const body = (await res.json()) as { fileName?: string; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Upload failed");
        setProgress(null);
        return;
      }
      if (!body.fileName) {
        setError("Upload succeeded but no file name returned");
        setProgress(null);
        return;
      }
      setProgress(100);
      onUploaded(body.fileName);
    } catch (err) {
      console.error(err);
      setError("Network error during upload");
      setProgress(null);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f);
  };

  const downloadTemplate = () => {
    const lines = [
      TEMPLATE_HEADER.join(","),
      TEMPLATE_EXAMPLE.map((v) => (v.includes(",") ? `"${v}"` : v)).join(","),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "3dninjaz-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
        style={{
          borderColor: dragOver ? BRAND.green : `${BRAND.ink}33`,
          backgroundColor: dragOver ? `${BRAND.green}10` : "#ffffff",
          color: BRAND.ink,
        }}
      >
        <p className="text-sm font-semibold mb-2">
          Drag &amp; drop a CSV here, or
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px]"
          style={{ backgroundColor: BRAND.ink }}
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <p className="mt-3 text-xs text-slate-500">
          Max 5 MB · 1000 rows · UTF-8 · external image URLs are rejected
        </p>
        {progress !== null ? (
          <p className="mt-3 text-xs font-semibold">
            {progress < 100 ? "Uploading…" : "Upload complete"}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
          >
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={downloadTemplate}
        className="text-sm underline decoration-dotted"
        style={{ color: BRAND.ink }}
      >
        Download template CSV
      </button>
    </div>
  );
}
