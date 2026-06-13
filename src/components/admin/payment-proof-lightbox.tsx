"use client";

/**
 * Phase 20 (20-11) — PaymentProofLightbox.
 *
 * Full-screen z-50 modal:
 *   ≥768px: two-pane — image 75% left, metadata sidebar 25% right (cream bg)
 *   <768px: full-bleed image + Vaul bottom-sheet metadata (40% viewport)
 *
 * Close affordances: top-right X (48px), Esc key, backdrop click.
 * Keyboard: ← / → navigates between proofs when proofs.length >= 2.
 * Focus trap: focus returns to opener element on close.
 *
 * Sidebar EXPECTED AMOUNT: 40px Chakra Petch bold green-700 with sub-label.
 * Uses vaul (Drawer primitive) for the mobile bottom-sheet metadata pane.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  Clock,
  HardDrive,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import type { PaymentProof } from "./payment-proof-section";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// MetadataContent — shared between desktop sidebar + mobile Vaul sheet
// ---------------------------------------------------------------------------

function MetadataContent({
  proof,
  orderTotal,
}: {
  proof: PaymentProof;
  orderTotal: number | string;
}) {
  const fileName = proof.imageUrl.split("/").pop() ?? "file";

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Status */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Status</p>
        <StatusPill status={proof.status} />
      </div>

      {/* File name */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">File name</p>
        <p className="font-mono text-xs break-all text-slate-700">{fileName}</p>
      </div>

      {/* Uploaded */}
      <div className="flex items-start gap-2">
        <Clock size={16} className="flex-shrink-0 mt-0.5 text-slate-500" />
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Uploaded</p>
          <p className="text-slate-700">{formatDateTime(proof.createdAt)}</p>
        </div>
      </div>

      {/* Uploader */}
      <div className="flex items-start gap-2">
        {proof.uploadedBy === "customer" ? (
          <User size={16} className="flex-shrink-0 mt-0.5 text-slate-500" />
        ) : (
          <Shield size={16} className="flex-shrink-0 mt-0.5 text-slate-500" />
        )}
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Uploaded by</p>
          <p className="text-slate-700">
            {proof.uploadedBy === "customer" ? "Customer" : "Admin"}
          </p>
        </div>
      </div>

      {/* File size + MIME */}
      <div className="flex items-start gap-2">
        <HardDrive size={16} className="flex-shrink-0 mt-0.5 text-slate-500" />
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">File</p>
          <p className="text-slate-700">
            {formatBytes(proof.sizeBytes)} &middot; {proof.mimeType}
          </p>
        </div>
      </div>

      {/* Expected amount — 40px Chakra Petch bold green-700 */}
      <div className="mt-2 pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
          Expected amount
        </p>
        <p
          className="font-bold leading-none"
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 40,
            color: "#15803d", // green-700
          }}
        >
          {formatMYR(orderTotal)}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Order total — confirm slip matches
        </p>
      </div>

      {/* Admin note if rejected */}
      {proof.adminNote && proof.status === "rejected" && (
        <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-[4px] p-3">
          <span className="font-medium block mb-1">Rejection note:</span>
          {proof.adminNote}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImagePane — handles image vs PDF render
// ---------------------------------------------------------------------------

function ImagePane({ proof }: { proof: PaymentProof }) {
  if (proof.mimeType === "application/pdf") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <div
          className="flex flex-col items-center justify-center p-8 rounded-[4px]"
          style={{ backgroundColor: BRAND.cream, maxWidth: 320 }}
        >
          <FileText size={64} color={BRAND.ink} />
          <p className="mt-3 text-sm text-center break-all text-slate-700">
            {proof.imageUrl.split("/").pop()}
          </p>
          <a
            href={proof.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-[4px] transition-colors duration-150"
            style={{ backgroundColor: BRAND.blue }}
          >
            Open PDF
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <Image
        src={proof.imageUrl}
        alt="Payment proof"
        fill
        className="object-contain p-6"
        unoptimized
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaymentProofLightbox
// ---------------------------------------------------------------------------

export function PaymentProofLightbox({
  proofs,
  initialIndex = 0,
  onClose,
  orderTotal,
}: {
  proofs: PaymentProof[];
  initialIndex?: number;
  onClose: () => void;
  orderTotal: number | string;
}) {
  const [current, setCurrent] = useState(initialIndex);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true);
  const openerRef = useRef<Element | null>(null);

  const proof = proofs[current];
  const hasPrev = current > 0;
  const hasNext = current < proofs.length - 1;

  // Capture opener element for focus restore
  useEffect(() => {
    openerRef.current = document.activeElement;
    return () => {
      if (openerRef.current instanceof HTMLElement) {
        openerRef.current.focus();
      }
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        setCurrent((c) => c - 1);
      }
      if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        setCurrent((c) => c + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasPrev, hasNext, onClose]);

  // Reset mobile sheet when proof changes
  useEffect(() => {
    setMobileSheetOpen(true);
  }, [current]);

  function handleBackdropClick() {
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Payment proof lightbox"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(11, 16, 32, 0.95)" }}
        onClick={handleBackdropClick}
      />

      {/* Close button — top right */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close lightbox"
        className="absolute top-4 right-4 flex items-center justify-center rounded-[4px] text-white bg-white/10 hover:bg-white/20 transition-colors duration-150"
        style={{ zIndex: 51, width: 48, height: 48 }}
      >
        <X size={24} />
      </button>

      {/* Proof counter */}
      {proofs.length > 1 && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm"
          style={{ zIndex: 51 }}
        >
          {current + 1} / {proofs.length}
        </div>
      )}

      {/* Navigation arrows */}
      {proofs.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => hasPrev && setCurrent((c) => c - 1)}
            disabled={!hasPrev}
            aria-label="Previous proof"
            className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-[4px] text-white bg-white/10 hover:bg-white/20 transition-colors duration-150 disabled:opacity-30"
            style={{ zIndex: 51, width: 48, height: 48 }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={() => hasNext && setCurrent((c) => c + 1)}
            disabled={!hasNext}
            aria-label="Next proof"
            className="absolute right-16 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-[4px] text-white bg-white/10 hover:bg-white/20 transition-colors duration-150 disabled:opacity-30"
            style={{ zIndex: 51, width: 48, height: 48 }}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* Main content area */}
      <div
        className="relative flex w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Desktop layout: image 75% left + metadata sidebar 25% right ── */}
        <div
          className="hidden md:flex w-full h-full"
        >
          {/* Image pane — 75% */}
          <div className="flex-1 relative min-w-0">
            <ImagePane proof={proof} />
          </div>

          {/* Metadata sidebar — 25% */}
          <div
            className="w-1/4 flex-shrink-0 overflow-y-auto p-6"
            style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
          >
            <MetadataContent proof={proof} orderTotal={orderTotal} />
          </div>
        </div>

        {/* ── Mobile layout: full-bleed image + Vaul bottom-sheet ── */}
        <div className="md:hidden w-full h-full">
          {/* Full-bleed image */}
          <div className="relative w-full h-full">
            <ImagePane proof={proof} />
          </div>

          {/* Vaul bottom-sheet for metadata — 40% viewport, drag-to-collapse */}
          <DrawerPrimitive.Root
            open={mobileSheetOpen}
            onOpenChange={setMobileSheetOpen}
            direction="bottom"
          >
            <DrawerPrimitive.Portal>
              {/* No overlay — we already have the lightbox backdrop */}
              <DrawerPrimitive.Content
                className="fixed bottom-0 left-0 right-0 flex flex-col rounded-t-[16px] overflow-hidden"
                style={{
                  zIndex: 52,
                  height: "40vh",
                  backgroundColor: BRAND.cream,
                  color: BRAND.ink,
                }}
                aria-label="Payment proof metadata"
              >
                {/* Drag handle */}
                <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-black/20 flex-shrink-0" />

                {/* Scrollable metadata */}
                <div className="overflow-y-auto flex-1 min-h-0 p-5">
                  <MetadataContent proof={proof} orderTotal={orderTotal} />
                </div>
              </DrawerPrimitive.Content>
            </DrawerPrimitive.Portal>
          </DrawerPrimitive.Root>
        </div>
      </div>
    </div>
  );
}
