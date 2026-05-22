"use client";

/**
 * Phase 20 (20-11) — AdminUploadProofForm.
 *
 * Admin-side payment slip upload zone for /admin/orders/[id].
 * Matches the visual shape of the customer's bank-transfer-card upload pane.
 * No XHR progress required for admin path (per 20-UI-SPEC.md Surface 3).
 * Calls adminUploadPaymentProof(orderId, formData) via useTransition.
 *
 * MIME allowlist: image/jpeg, image/png, image/webp, image/heic, image/heif,
 * application/pdf — server enforces the same caps via writePaymentProof (D-10).
 */

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, UploadCloud, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { adminUploadPaymentProof } from "@/actions/admin-payment-proofs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// AdminUploadProofForm
// ---------------------------------------------------------------------------

type Props = {
  orderId: string;
  /** Optional callback after a successful upload. Server action's revalidatePath
   * already triggers the RSC re-render so this prop is rarely needed. Making it
   * optional prevents a server→client function-prop crash when rendered from a
   * Server Component (RSC cannot pass functions as props). */
  onSuccess?: () => void;
};

export function AdminUploadProofForm({ orderId, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  function validateAndSet(file: File | null) {
    setValidationError(null);
    setSubmitError(null);

    if (!file) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
      setValidationError(
        "Unsupported file type. Allowed: JPG, PNG, WebP, HEIC, HEIF, PDF.",
      );
      return;
    }

    if (file.size > MAX_BYTES) {
      setValidationError("File exceeds 10 MB limit.");
      return;
    }

    setSelectedFile(file);

    // Build preview URL for images
    if (file.type !== "application/pdf" && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    validateAndSet(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSet(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function clearFile() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit() {
    if (!selectedFile || pending) return;
    setSubmitError(null);

    const formData = new FormData();
    formData.set("file", selectedFile);

    startTransition(async () => {
      const result = await adminUploadPaymentProof(orderId, formData);
      if (result.ok) {
        clearFile();
        onSuccess?.();
      } else {
        setSubmitError(result.error);
      }
    });
  }

  const isPdf = selectedFile?.type === "application/pdf";

  return (
    <section
      className="border-2 border-slate-200 p-4 md:p-6"
      style={{ borderRadius: 4, backgroundColor: "#ffffff" }}
    >
      <h3
        className="text-lg font-semibold mb-1"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Upload payment proof
      </h3>
      <p className="text-sm text-slate-600 mb-4">
        Attach a payment slip on behalf of the customer.
      </p>

      {/* Drop-zone */}
      {!selectedFile ? (
        <div
          className="rounded-[4px] border-2 border-dashed p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-150"
          style={{
            minHeight: 160,
            borderColor: dragOver ? "#8A00C2" : "#cbd5e1", // purple when dragover, else slate-300
            backgroundColor: dragOver ? "#faf5ff" : "transparent",
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload payment slip drop zone"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
        >
          <UploadCloud size={32} color={BRAND.ink} />
          <p className="mt-3 text-sm font-medium text-slate-700">
            Tap to upload or drop a file
          </p>
          <p className="mt-1 text-xs text-slate-500">
            JPG / PNG / WebP / HEIC / PDF &middot; max 10 MB
          </p>
        </div>
      ) : (
        /* File preview */
        <div className="flex items-start gap-4">
          {isPdf ? (
            <div
              className="flex flex-col items-center justify-center border-2 border-slate-200 flex-shrink-0"
              style={{
                width: 80,
                height: 80,
                borderRadius: 4,
                backgroundColor: BRAND.cream,
              }}
            >
              <FileText size={32} color={BRAND.ink} />
            </div>
          ) : previewUrl ? (
            <div
              className="relative border-2 border-slate-200 overflow-hidden flex-shrink-0"
              style={{ width: 80, height: 80, borderRadius: 4 }}
            >
              <Image
                src={previewUrl}
                alt="Selected file preview"
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : null}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 break-all">
              {selectedFile.name}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatBytes(selectedFile.size)} &middot; {selectedFile.type}
            </p>
            <button
              type="button"
              onClick={clearFile}
              className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              <X size={12} />
              Replace
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={[...ALLOWED_MIME, "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"].join(",")}
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* MIME hint (screen-reader visible) */}
      <p className="sr-only">
        Accepted file types: image/jpeg, image/png, image/webp, image/heic, image/heif, application/pdf
      </p>

      {/* Validation error */}
      {validationError && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-[4px] p-2">
          {validationError}
        </p>
      )}

      {/* Submit error */}
      {submitError && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-[4px] p-2">
          {submitError}
        </p>
      )}

      {/* Submit button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selectedFile || !!validationError || pending}
        className="mt-4 inline-flex items-center gap-2 px-5 font-semibold text-white rounded-[4px] transition-colors duration-150 disabled:opacity-50"
        style={{
          minHeight: 48,
          backgroundColor: BRAND.green,
        }}
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {pending ? "Uploading…" : "Upload proof"}
      </button>
    </section>
  );
}
