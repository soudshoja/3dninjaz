"use client";

/**
 * Phase 20 (20-11) — PaymentProofSection + RejectProofModal.
 *
 * PaymentProofSection renders ONLY when proofs.length > 0 (early-return null
 * otherwise). Latest proof shown prominently; older proofs in a collapsible
 * <details> (HTML native disclosure — no Base UI Disclosure installed).
 *
 * Confirm path:  useTransition → confirmPaymentProof → optimistic approved flash
 * Reject path:   opens RejectProofModal; success → row status swaps to rejected
 *
 * AD-06 (Phase 17): no router.refresh() — revalidatePath in the action triggers
 * RSC re-render from the server; the client sees updated props on next render.
 */

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  XCircle,
  FileText,
  User,
  Shield,
  Clock,
  HardDrive,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import {
  confirmPaymentProof,
  rejectPaymentProof,
} from "@/actions/admin-payment-proofs";
import { PaymentProofLightbox } from "./payment-proof-lightbox";
import { RejectProofModal } from "./reject-proof-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentProof = {
  id: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: "customer" | "admin";
  uploadedByUserId: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: Date;
};

type Props = {
  orderId: string;
  proofs: PaymentProof[];
  orderTotal: number | string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusPill({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: "#fffbeb", text: "#b45309", label: "Pending" },
    approved: { bg: "#f0fdf4", text: "#15803d", label: "Approved" },
    rejected: { bg: "#fef2f2", text: "#b91c1c", label: "Rejected" },
  };
  const s = styles[status];
  return (
    <span
      className="inline-flex items-center px-3 py-0.5 rounded-[4px] text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ThumbOrPdf({
  proof,
  size = 256,
  radius = 12,
  onClick,
}: {
  proof: PaymentProof;
  size?: number;
  radius?: number;
  onClick: () => void;
}) {
  if (proof.mimeType === "application/pdf") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Open PDF proof"
        className="flex flex-col items-center justify-center border-2 border-slate-200 cursor-pointer hover:border-slate-400 transition-colors duration-150"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: BRAND.cream,
          flexShrink: 0,
        }}
      >
        <FileText size={48} color={BRAND.ink} />
        <span className="mt-2 text-xs text-slate-600 text-center px-2 break-all line-clamp-2">
          {proof.imageUrl.split("/").pop()}
        </span>
      </button>
    );
  }

  const src = proof.thumbnailUrl ?? proof.imageUrl;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open payment proof image"
      className="relative overflow-hidden border-2 border-slate-200 cursor-pointer hover:border-slate-400 transition-colors duration-150 flex-shrink-0"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <Image
        src={src}
        alt="Payment proof thumbnail"
        fill
        sizes={`${size}px`}
        className="object-cover"
        unoptimized
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// PaymentProofSection
// ---------------------------------------------------------------------------

export function PaymentProofSection({ orderId, proofs, orderTotal }: Props) {
  // Early return — section only renders when at least one proof exists.
  if (!proofs || proofs.length === 0) return null;

  return <PaymentProofSectionInner orderId={orderId} proofs={proofs} orderTotal={orderTotal} />;
}

// Inner component isolates hooks from the early-return guard
function PaymentProofSectionInner({ orderId, proofs, orderTotal }: Props) {
  const [localProofs, setLocalProofs] = useState<PaymentProof[]>(proofs);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmPending, startConfirmTransition] = useTransition();
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<
    Record<string, "pending" | "approved" | "rejected">
  >({});

  const latestProof = localProofs[0];
  const olderProofs = localProofs.slice(1);

  const getStatus = (proof: PaymentProof) =>
    optimisticStatus[proof.id] ?? proof.status;

  function handleConfirm() {
    setConfirmError(null);
    // Optimistic: flash green
    setOptimisticStatus((s) => ({ ...s, [latestProof.id]: "approved" }));
    startConfirmTransition(async () => {
      const result = await confirmPaymentProof(latestProof.id);
      if (!result.ok) {
        // Rollback
        setOptimisticStatus((s) => {
          const copy = { ...s };
          delete copy[latestProof.id];
          return copy;
        });
        setConfirmError(result.error);
      }
      // On success: revalidatePath in the action will refresh the page server
      // component; optimistic state remains until the props update arrives.
    });
  }

  function handleRejectSuccess() {
    setOptimisticStatus((s) => ({ ...s, [latestProof.id]: "rejected" }));
    setRejectOpen(false);
  }

  const currentStatus = getStatus(latestProof);

  return (
    <>
      <section
        className="border-2 border-slate-200 p-4 md:p-6"
        style={{ borderRadius: 4, backgroundColor: "#ffffff" }}
      >
        <h3
          className="text-lg font-semibold mb-4"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Payment proof
        </h3>

        {/* Latest proof block */}
        <div className="flex gap-4 flex-wrap sm:flex-nowrap">
          {/* Thumbnail / PDF */}
          <ThumbOrPdf
            proof={latestProof}
            size={256}
            radius={12}
            onClick={() => setLightboxIndex(0)}
          />

          {/* Metadata column */}
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            {/* Status pill */}
            <div>
              <StatusPill status={currentStatus} />
            </div>

            {/* Uploader */}
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {latestProof.uploadedBy === "customer" ? (
                <User size={16} className="flex-shrink-0" />
              ) : (
                <Shield size={16} className="flex-shrink-0" />
              )}
              <span>
                {latestProof.uploadedBy === "customer"
                  ? "Customer"
                  : `Admin`}
              </span>
            </div>

            {/* Upload time */}
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock size={16} className="flex-shrink-0" />
              <span>{formatDateTime(latestProof.createdAt)}</span>
            </div>

            {/* File size + MIME */}
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <HardDrive size={16} className="flex-shrink-0" />
              <span>
                {formatBytes(latestProof.sizeBytes)} &middot;{" "}
                {latestProof.mimeType}
              </span>
            </div>

            {/* Expected amount — 28px Chakra Petch bold green-700 */}
            <div className="mt-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                Expected amount
              </p>
              <p
                className="font-bold leading-none"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 28,
                  color: "#15803d", // green-700
                }}
              >
                {formatMYR(orderTotal)}
              </p>
            </div>

            {/* Admin note (when rejected) */}
            {latestProof.adminNote && currentStatus === "rejected" && (
              <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-[4px] p-2">
                <span className="font-medium">Rejection note: </span>
                {latestProof.adminNote}
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {confirmError && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-[4px] p-2">
            {confirmError}
          </div>
        )}

        {/* Action buttons — only when latest is pending */}
        {currentStatus === "pending" && (
          <div className="mt-4 flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmPending}
              className="inline-flex items-center gap-2 px-5 font-semibold text-white rounded-[4px] transition-colors duration-150 disabled:opacity-60"
              style={{
                minHeight: 60,
                backgroundColor: confirmPending ? "#1AAE54" : BRAND.green,
              }}
            >
              {confirmPending ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <CheckCircle2 size={20} />
              )}
              {confirmPending ? "Working…" : "Confirm Payment"}
            </button>

            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              disabled={confirmPending}
              className="inline-flex items-center gap-2 px-5 font-semibold rounded-[4px] border-2 transition-colors duration-150 disabled:opacity-60 hover:bg-red-50"
              style={{
                minHeight: 60,
                color: "#b91c1c",
                borderColor: "#fca5a5",
              }}
            >
              <XCircle size={20} />
              Reject
            </button>
          </div>
        )}

        {/* History disclosure — older proofs */}
        {olderProofs.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900 select-none py-2">
              History ({olderProofs.length} older{" "}
              {olderProofs.length === 1 ? "proof" : "proofs"})
            </summary>
            <ul className="mt-2 divide-y divide-slate-100">
              {olderProofs.map((proof, idx) => (
                <li key={proof.id} className="flex items-center gap-3 py-2">
                  {/* 40×40 thumb */}
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx + 1)}
                    aria-label="Open older proof"
                    className="flex-shrink-0"
                  >
                    {proof.mimeType === "application/pdf" ? (
                      <div
                        className="flex items-center justify-center border border-slate-200"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 4,
                          backgroundColor: BRAND.cream,
                        }}
                      >
                        <FileText size={20} color={BRAND.ink} />
                      </div>
                    ) : (
                      <div
                        className="relative overflow-hidden border border-slate-200"
                        style={{ width: 40, height: 40, borderRadius: 4 }}
                      >
                        <Image
                          src={proof.thumbnailUrl ?? proof.imageUrl}
                          alt="Older proof"
                          fill
                          sizes="40px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    )}
                  </button>

                  <StatusPill status={getStatus(proof)} />

                  <span className="text-xs text-slate-600 flex items-center gap-1">
                    {proof.uploadedBy === "customer" ? (
                      <User size={12} />
                    ) : (
                      <Shield size={12} />
                    )}
                    {proof.uploadedBy === "customer" ? "Customer" : "Admin"}
                  </span>

                  <span className="text-xs text-slate-500">
                    {formatDateTime(proof.createdAt)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx + 1)}
                    aria-label="View in lightbox"
                    className="ml-auto text-slate-500 hover:text-slate-700"
                  >
                    <ChevronRight size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PaymentProofLightbox
          proofs={localProofs}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          orderTotal={orderTotal}
        />
      )}

      {/* Reject modal */}
      <RejectProofModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        proofId={latestProof.id}
        onSuccess={handleRejectSuccess}
      />
    </>
  );
}
