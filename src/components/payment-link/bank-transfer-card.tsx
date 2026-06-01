"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  UploadCloud,
  Loader2,
  FileText,
  X,
} from "lucide-react";
import { formatMYR } from "@/lib/format";

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface CopyChipProps {
  label: string;
  value: string;
  mono?: boolean;
  large?: boolean;
  green?: boolean;
}

/**
 * A single copy-to-clipboard chip row.
 * On click: swaps to Check icon (green) for 1.5s.
 */
function CopyChip({ label, value, mono = false, large = false, green = false }: CopyChipProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available — silently ignore.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-[4px] border-2 border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 leading-tight">{label}</p>
        <p
          className={[
            "leading-tight mt-0.5 font-semibold break-all",
            mono ? "font-mono text-[18px]" : "text-sm",
            large ? "font-[var(--font-heading)] text-[24px]" : "",
            green ? "text-green-700" : "text-[#0B1020]",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={handleCopy}
        className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-[4px] transition-colors duration-150 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-[#8A00C2] focus:ring-offset-1"
      >
        {copied ? (
          <Check size={18} className="text-green-600" aria-hidden />
        ) : (
          <Copy size={18} className="text-slate-500" aria-hidden />
        )}
      </button>
    </div>
  );
}

interface Props {
  token: string;
  orderId: string;
  orderTotal: string;
  bankSettings: {
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolder: string;
  };
}

/**
 * Phase 20 (20-08) — Bank Transfer expanded card.
 *
 * D-14: Expanded body inside the Bank Transfer card in the method picker.
 * D-10: 10 MB cap + MIME allowlist enforced UI-side (server also validates).
 * XHR upload (not fetch) for progress events (memory project_image_upload_pipeline).
 * On success: router.refresh() so server component re-renders ProofPendingState.
 */
export function BankTransferCard({ token, orderTotal, bankSettings }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function validateFile(f: File): string | null {
    if (!ALLOWED_MIME.includes(f.type)) {
      return `Unsupported file type: ${f.type}. Please use JPG, PNG, WebP, HEIC, or PDF.`;
    }
    if (f.size > MAX_BYTES) {
      return `File is too large (${formatBytes(f.size)}). Maximum is 10 MB.`;
    }
    return null;
  }

  function handleFileSelect(f: File) {
    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setFile(f);
    // Generate preview URL for images.
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null); // PDF — show placeholder
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl || fl.length === 0) return;
    handleFileSelect(fl[0]);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const fl = e.dataTransfer.files;
    if (!fl || fl.length === 0) return;
    handleFileSelect(fl[0]);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!file) return;
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.set("file", file);

    // XHR for upload progress events (not fetch — fetch doesn't expose upload progress).
    const result = await new Promise<{ ok: boolean; error?: string }>(
      (resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/payment-links/${token}/proof`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.upload.onload = () => {
          setUploadProgress(100);
        };

        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText) as {
              ok?: boolean;
              error?: string;
            };
            if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
              resolve({ ok: true });
            } else {
              resolve({
                ok: false,
                error: json.error ?? `Upload failed (HTTP ${xhr.status})`,
              });
            }
          } catch {
            resolve({ ok: false, error: `HTTP ${xhr.status}` });
          }
        };

        xhr.onerror = () =>
          resolve({ ok: false, error: "Network error. Please try again." });
        xhr.ontimeout = () =>
          resolve({ ok: false, error: "Upload timed out. Please try again." });
        xhr.timeout = 120_000;

        xhr.send(formData);
      },
    );

    setIsUploading(false);

    if (result.ok) {
      setDone(true);
      // Refresh the server component so it re-reads the new awaiting_payment_review status
      // and swaps to ProofPendingState.
      router.refresh();
    } else {
      setError(result.error ?? "Upload failed. Please try again.");
    }
  }

  const amountLabel = `MYR ${formatMYR(orderTotal)}`.replace("RM ", "MYR ");

  // Show a temporary "submitted" message while the router refresh is in-flight.
  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Check size={40} className="text-green-600" aria-hidden />
        <p className="font-semibold text-[#0B1020]">
          Proof submitted — refreshing…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bank details chips */}
      <div className="space-y-2">
        <CopyChip label="Bank" value={bankSettings.bankName} />
        <CopyChip
          label="Account number"
          value={bankSettings.bankAccountNumber}
          mono
        />
        <CopyChip label="Account holder" value={bankSettings.bankAccountHolder} />
        <CopyChip
          label="Amount due"
          value={amountLabel}
          large
          green
        />
      </div>

      {/* Instruction */}
      <p className="text-[14px] text-slate-700 leading-relaxed">
        Transfer the exact amount to the account above. Snap a clear photo of
        the receipt and upload it here.
      </p>

      {/* Slip upload zone */}
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload payment slip"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[4px] border-2 border-dashed border-[#8A00C2] p-6 text-center min-h-[160px] transition-colors duration-150 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-[#8A00C2] focus:ring-offset-2"
        >
          <UploadCloud size={32} className="text-[#8A00C2]" aria-hidden />
          <p className="text-sm font-medium text-[#0B1020]">
            Tap to upload or drop a file
          </p>
          <p className="text-xs text-slate-500">
            JPG / PNG / WebP / HEIC / PDF · max 10 MB
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={[
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/heic",
              "image/heif",
              "application/pdf",
              ".heic",
              ".heif",
            ].join(",")}
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      ) : (
        /* File selected — show thumbnail / PDF placeholder */
        <div className="space-y-2">
          <div className="relative rounded-[4px] border-2 border-slate-200 bg-slate-50 overflow-hidden">
            {/* Progress bar — 4px edge along bottom (UI-SPEC) */}
            {isUploading && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200">
                <div
                  className="h-full bg-[#8A00C2] transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            {preview ? (
              /* Image thumbnail */
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Payment slip preview"
                  className="w-full max-h-64 object-contain bg-slate-100"
                />
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={clearFile}
                  className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-[4px] bg-black/60 text-white hover:bg-black/80 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-white"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ) : (
              /* PDF placeholder */
              <div className="flex items-center gap-3 p-4">
                <FileText size={32} className="flex-shrink-0 text-slate-400" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0B1020] truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={clearFile}
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-[4px] text-slate-500 hover:bg-slate-200 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#8A00C2]"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            )}
          </div>

          {preview && (
            <p className="text-xs text-slate-500 text-center">
              {file.name} · {formatBytes(file.size)}
            </p>
          )}

          {/* Replace button */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-[#8A00C2] underline underline-offset-2 hover:text-[#62008C] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#8A00C2] rounded-[4px] px-1"
          >
            Replace file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={[
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/heic",
              "image/heif",
              "application/pdf",
              ".heic",
              ".heif",
            ].join(",")}
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      )}

      {/* Inline error */}
      {error ? (
        <div
          className="rounded-[4px] border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {/* Submit button — 60px min-height, full-width, green, disabled until file picked */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || isUploading}
        className="w-full min-h-[60px] rounded-[4px] flex items-center justify-center gap-2 font-semibold text-base text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#03C03C] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: !file || isUploading ? "#018A29" : "#03C03C",
        }}
      >
        {isUploading ? (
          <>
            <Loader2 size={20} className="animate-spin" aria-hidden />
            Uploading… {uploadProgress}%
          </>
        ) : (
          "Submit proof of payment"
        )}
      </button>
    </div>
  );
}
