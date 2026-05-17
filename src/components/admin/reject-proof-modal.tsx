"use client";

/**
 * Phase 20 (20-11) — RejectProofModal.
 *
 * Centred z-40 modal, max-width 480px, 4px corners, 2px ink border.
 * Textarea requires minLength 8 before submit.
 * Calls rejectPaymentProof(proofId, adminNote) on confirm.
 *
 * Using a plain portal-based modal (no Base UI Dialog dependency) to keep
 * z-index control explicit at z-40.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { X, Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { rejectPaymentProof } from "@/actions/admin-payment-proofs";

type Props = {
  open: boolean;
  onClose: () => void;
  proofId: string;
  onSuccess: () => void;
};

export function RejectProofModal({ open, onClose, proofId, onSuccess }: Props) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);

  // Trap focus + capture opener for restore on close
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
      setTimeout(() => textareaRef.current?.focus(), 50);
    } else {
      setNote("");
      setError(null);
      if (openerRef.current instanceof HTMLElement) {
        openerRef.current.focus();
      }
    }
  }, [open]);

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const isValid = note.trim().length >= 8;

  function handleSubmit() {
    if (!isValid || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectPaymentProof(proofId, note.trim());
      if (result.ok) {
        onSuccess();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 40, backgroundColor: "rgba(11, 16, 32, 0.7)" }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="reject-modal-title"
    >
      {/* Panel */}
      <div
        className="relative w-full flex flex-col"
        style={{
          maxWidth: 480,
          borderRadius: 4,
          border: `2px solid ${BRAND.ink}`,
          backgroundColor: "#ffffff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-200">
          <h3
            id="reject-modal-title"
            className="font-semibold text-lg"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Reject this payment proof
          </h3>
          <button
            ref={firstFocusRef}
            type="button"
            onClick={onClose}
            aria-label="Close reject modal"
            className="flex items-center justify-center rounded-[4px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors duration-150"
            style={{ width: 32, height: 32 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <label htmlFor="reject-note" className="block text-sm font-medium mb-2">
            Reason for rejection{" "}
            <span className="text-red-600" aria-hidden="true">*</span>
          </label>
          <textarea
            id="reject-note"
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minLength={8}
            required
            rows={4}
            placeholder="Tell the customer what went wrong. e.g. 'Slip shows RM 90 but order is RM 120 — please re-upload the correct receipt.'"
            className="w-full rounded-[4px] border-2 border-slate-300 focus:border-blue-500 focus:outline-none p-3 text-sm resize-y transition-colors duration-150"
            style={{
              minHeight: 80,
              fontFamily: "inherit",
            }}
            aria-describedby={error ? "reject-error" : undefined}
          />
          {note.length > 0 && note.trim().length < 8 && (
            <p className="mt-1 text-xs text-red-600">
              Please enter at least 8 characters.
            </p>
          )}
          {error && (
            <p id="reject-error" className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-[4px] p-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center px-5 font-semibold rounded-[4px] border-2 border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors duration-150 disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            Cancel
          </button>

          <button
            ref={lastFocusRef}
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || pending}
            className="inline-flex items-center gap-2 px-5 font-semibold text-white rounded-[4px] transition-colors duration-150 disabled:opacity-50"
            style={{
              minHeight: 48,
              backgroundColor: "#dc2626", // red-600
            }}
          >
            {pending && <Loader2 size={16} className="animate-spin" />}
            {pending ? "Working…" : "Confirm rejection"}
          </button>
        </div>
      </div>
    </div>
  );
}
