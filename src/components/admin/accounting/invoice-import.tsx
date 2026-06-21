"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { previewInvoice, confirmInvoiceImport } from "@/actions/admin-invoice-import";
import type { InvoicePreview } from "@/lib/accounting-types";

const CATEGORIES = [
  ["materials", "Materials"],
  ["utilities", "Utilities"],
  ["marketing", "Marketing"],
  ["shipping", "Shipping"],
  ["equipment", "Equipment"],
  ["other", "Other"],
] as const;

const ACCOUNTS = [
  ["bank", "Bank"],
  ["paypal", "PayPal"],
  ["cash", "Cash"],
] as const;

const inputCls = "w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]";
const border = { borderColor: `${BRAND.ink}33` };

type Stage = "idle" | "busy" | "preview" | "done";

/**
 * Downscale + re-encode an image File to a JPEG Blob (max edge ~2000px).
 * Converts iPhone HEIC to JPEG via the canvas decode path; throws if the
 * browser can't decode the image (caller falls back to a friendly message).
 */
async function imageToJpeg(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("read-failed"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode-failed"));
    i.src = dataUrl;
  });
  const max = 2000;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode-failed"))),
      "image/jpeg",
      0.85,
    );
  });
}

export function InvoiceImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Extract<InvoicePreview, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();

  // Editable preview fields.
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [paidFrom, setPaidFrom] = useState<string>("bank");
  const [note, setNote] = useState("");

  async function onFile(file: File) {
    setError(null);
    setStage("busy");
    try {
      // Build the upload body: images → downscaled JPEG; PDFs pass through.
      let blob: Blob = file;
      let filename = file.name;
      if (file.type.startsWith("image/")) {
        try {
          blob = await imageToJpeg(file);
          filename = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        } catch {
          // HEIC/HEIF can't be decoded by <canvas> on non-Apple browsers —
          // send the original; the server + Tika OCR handle it. Other
          // undecodable images get the friendly error.
          if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
            blob = file;
            filename = file.name;
          } else {
            setError("Couldn't read that image. Try a clearer photo or a PDF.");
            setStage("idle");
            return;
          }
        }
      }

      const fd = new FormData();
      fd.append("file", blob, filename);
      const up = await fetch("/api/admin/invoices/upload", { method: "POST", body: fd });
      if (!up.ok) {
        const j = await up.json().catch(() => ({}));
        setError(j.error ?? "Upload failed");
        setStage("idle");
        return;
      }
      const { uploadedUrl, fileName } = (await up.json()) as {
        uploadedUrl: string;
        fileName: string;
      };

      const res = await previewInvoice(uploadedUrl, fileName);
      if (!res.ok) {
        setError(res.error);
        setStage("idle");
        return;
      }
      setPreview(res);
      setVendor(res.parsed.supplierName ?? "");
      setDate(res.parsed.invoiceDate ?? "");
      setAmount(res.parsed.amount ?? "");
      setCategory(res.parsed.category ?? "other");
      setPaidFrom("bank");
      setNote("");
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStage("idle");
    }
  }

  function onConfirm() {
    if (!preview) return;
    setError(null);
    if (!vendor.trim()) {
      setError("Please confirm the vendor before saving.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Please enter the invoice date.");
      return;
    }
    const amt = amount.trim().replace(",", "."); // accept comma-decimal locales
    if (!/^\d+(\.\d{1,2})?$/.test(amt)) {
      setError("Please enter the amount, e.g. 12.50.");
      return;
    }
    startTransition(async () => {
      const res = await confirmInvoiceImport({
        uploadedUrl: preview.uploadedUrl,
        expenseDate: date,
        category,
        amount: amt,
        paidFrom,
        supplierName: vendor.trim() || null,
        note: note.trim() || null,
      });
      if (res.ok) {
        setStage("done");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function reset() {
    setPreview(null);
    setStage("idle");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  // ---- Done ----
  if (stage === "done") {
    return (
      <div className="rounded-2xl p-6" style={{ backgroundColor: "#ffffff" }}>
        <p className="text-lg font-bold" style={{ color: BRAND.green }}>
          ✓ Expense imported
        </p>
        <p className="mt-1 text-sm text-slate-600">The invoice was saved as a receipt.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="rounded-full px-6 py-3 font-bold text-white min-h-[48px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Import another
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/accounting/expenses")}
            className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
          >
            View expenses
          </button>
        </div>
      </div>
    );
  }

  // ---- Preview / edit ----
  if (stage === "preview" && preview) {
    const p = preview.parsed;
    return (
      <div className="space-y-4" style={{ color: BRAND.ink }}>
        <div className="rounded-2xl p-4 sm:p-6 space-y-4" style={{ backgroundColor: "#ffffff" }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-lg">Review extracted details</h2>
            <a
              href={preview.uploadedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline decoration-dotted shrink-0"
            >
              View file
            </a>
          </div>

          {p.errors.length > 0 ? (
            <ul
              className="rounded-xl px-3 py-2 text-sm list-disc pl-6"
              style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
            >
              {p.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}

          {/* Vendor — highlighted when detection was unclear */}
          <div>
            <label htmlFor="ii-vendor" className="block text-sm font-semibold mb-1">
              Vendor {!p.vendorClear ? <span style={{ color: "#dc2626" }}>· confirm</span> : null}
            </label>
            <input
              id="ii-vendor"
              list="ii-vendors"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className={inputCls}
              style={{
                borderColor: !p.vendorClear && !vendor.trim() ? "#dc2626" : `${BRAND.ink}33`,
              }}
              placeholder="Select or type the vendor"
            />
            <datalist id="ii-vendors">
              {preview.knownVendors.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ii-date" className="block text-sm font-semibold mb-1">
                Date
              </label>
              <input
                id="ii-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
                style={border}
              />
            </div>
            <div>
              <label htmlFor="ii-amount" className="block text-sm font-semibold mb-1">
                Amount (MYR)
              </label>
              <input
                id="ii-amount"
                type="text"
                inputMode="decimal"
                pattern="\d+(\.\d{1,2})?"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
                style={border}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ii-category" className="block text-sm font-semibold mb-1">
                Category
              </label>
              <select
                id="ii-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`${inputCls} bg-white`}
                style={border}
              >
                {CATEGORIES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ii-paidFrom" className="block text-sm font-semibold mb-1">
                Paid from
              </label>
              <select
                id="ii-paidFrom"
                value={paidFrom}
                onChange={(e) => setPaidFrom(e.target.value)}
                className={`${inputCls} bg-white`}
                style={border}
              >
                {ACCOUNTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="ii-note" className="block text-sm font-semibold mb-1">
              Note (optional)
            </label>
            <input
              id="ii-note"
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              style={border}
            />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600">Extracted text</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              {preview.extractedText || "(empty)"}
            </pre>
          </details>

          {error ? (
            <p
              role="alert"
              className="rounded-xl px-3 py-2 text-sm"
              style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
              style={{ backgroundColor: BRAND.ink }}
            >
              {pending ? "Saving…" : "Save expense"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
              style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Idle / capture ----
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: "#ffffff", color: BRAND.ink }}>
      <p className="text-sm text-slate-600 mb-4">
        Snap a photo of a receipt or upload a PDF/image. We read it automatically —
        you just confirm the vendor if it&apos;s unclear, then save.
      </p>
      {/* Camera-only input (capture) + general file/gallery/PDF input. Two
          separate inputs so 'capture' never blocks gallery/PDF selection. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={stage === "busy"}
          onClick={() => cameraRef.current?.click()}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.ink }}
        >
          {stage === "busy" ? "Reading invoice…" : "Take photo"}
        </button>
        <button
          type="button"
          disabled={stage === "busy"}
          onClick={() => fileRef.current?.click()}
          className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px] disabled:opacity-50"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        >
          Upload PDF / image
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
