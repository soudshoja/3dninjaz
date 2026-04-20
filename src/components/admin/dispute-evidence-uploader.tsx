"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { provideEvidenceAction } from "@/actions/admin-disputes";

const EVIDENCE_TYPES = [
  "PROOF_OF_FULFILLMENT",
  "PROOF_OF_REFUND",
  "PROOF_OF_DELIVERY_SIGNATURE",
  "PROOF_OF_RECEIPT_COPY",
  "RETURN_POLICY",
  "BILLING_AGREEMENT",
  "PROOF_OF_RESHIPMENT",
  "ITEM_DESCRIPTION",
  "POLICE_REPORT",
  "AFFIDAVIT",
  "TERMINAL_ATM_RECEIPT",
  "PRESCRIPTION",
  "PICTURE_OF_PRESCRIPTION",
  "GOVERNMENT_ID",
  "PROOF_OF_RETURN",
  "OTHER",
] as const;

const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Phase 7 (07-06) — dispute evidence uploader.
 *
 * Client-side size + count check echoes server-side check (T-07-06-image-DoS,
 * PayPal limits). Tap targets >= 48px (D-04 mobile).
 */
export function DisputeEvidenceUploader({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [evidenceType, setEvidenceType] =
    useState<(typeof EVIDENCE_TYPES)[number]>("PROOF_OF_FULFILLMENT");
  const [notes, setNotes] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl) return;
    setError(null);
    const next: File[] = [];
    for (const f of Array.from(fl).slice(0, MAX_FILES - files.length)) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name} exceeds 10 MB`);
        continue;
      }
      next.push(f);
    }
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (files.length === 0 && notes.trim().length === 0) {
      setError("Provide notes or at least one file.");
      return;
    }
    const fd = new FormData();
    fd.set("evidence_type", evidenceType);
    fd.set("notes", notes);
    files.forEach((f, i) => fd.append(`file${i + 1}`, f, f.name));
    startTransition(async () => {
      const r = await provideEvidenceAction(disputeId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      setFiles([]);
      setNotes("");
      router.refresh();
    });
  }

  const inputClass =
    "w-full min-h-[48px] rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          Evidence submitted.
        </div>
      ) : null}
      <div>
        <label className="block text-sm font-medium mb-1">Evidence type</label>
        <select
          className={inputClass}
          value={evidenceType}
          onChange={(e) =>
            setEvidenceType(e.target.value as (typeof EVIDENCE_TYPES)[number])
          }
          disabled={pending}
        >
          {EVIDENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Notes (max 2000 chars)
        </label>
        <textarea
          className={inputClass + " min-h-[100px]"}
          rows={4}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending}
          placeholder="Tracking number, delivery confirmation, photos description..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Files (max 3, 10 MB each)
        </label>
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={onPick}
          disabled={pending || files.length >= MAX_FILES}
          className="block min-h-[48px] w-full text-sm"
        />
        {files.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1"
              >
                <span className="truncate">
                  {f.name} ({Math.round(f.size / 1024)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-red-700 underline"
                  disabled={pending}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          className="min-h-[60px] px-6"
          disabled={pending}
        >
          {pending ? "Uploading..." : "Submit evidence"}
        </Button>
      </div>
    </form>
  );
}
