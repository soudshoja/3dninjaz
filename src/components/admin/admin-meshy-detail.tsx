"use client";

/**
 * Phase 21 (21-07) — the review cockpit: /admin/meshy/[id].
 *
 * Live-polling status (mirrors whatsapp-connect-panel.tsx's setInterval
 * skeleton — the only precedent in this repo), the full state-matrix action
 * row (21-UI-SPEC §Page 3 + §State Matrix), the printability report card,
 * revision history, and download buttons.
 *
 * Locked decisions made visible here: explicit-click repair (never
 * auto-fired — fires only from AdminMeshyPrintabilityCard's onRepair after
 * the admin's own click), retexture-first revisions with a 3-day fallback
 * to regenerate, and a two-step confirm before a full-price regenerate.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { AdminMeshyStatusBadge } from "@/components/admin/admin-meshy-status-badge";
import { AdminMeshyModelViewer } from "@/components/admin/admin-meshy-model-viewer";
import { AdminMeshyPrintabilityCard } from "@/components/admin/admin-meshy-printability-card";
import { AdminMeshyRevisionHistory } from "@/components/admin/admin-meshy-revision-history";
import {
  pollGeneration,
  getGeneration,
  requestRevision,
  approveGeneration,
  repairGeneration as requestRepair,
  runMulticolor,
  cancelGeneration,
  type GenerationDetail,
} from "@/actions/admin-meshy";
import {
  MESHY_ACTIVE_STATUSES,
  MESHY_RETEXTURE_WINDOW_MS,
  type MeshyGenerationStatus,
} from "@/lib/meshy/types";

const POLL_INTERVAL_MS = 6_000;

const GHOST_LABELS: Partial<Record<MeshyGenerationStatus, string>> = {
  generating: "Generating...",
  revising: "Revising...",
  analyzing: "Checking printability...",
  repairing: "Repairing...",
  processing_multicolor: "Converting to multi-color...",
};

const RETEXTURE_EXPIRED_MESSAGE = "Source task expired on Meshy — use Regenerate";

function GhostStatusButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="flex min-h-[48px] items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold opacity-60"
      style={{ backgroundColor: `${BRAND.ink}11`, color: BRAND.ink }}
    >
      <Loader2 size={16} className="animate-spin" />
      {label}
    </button>
  );
}

export function AdminMeshyDetail({ initial }: { initial: GenerationDetail }) {
  const generationId = initial.id;
  const [gen, setGen] = useState<GenerationDetail>(initial);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showRetexture, setShowRetexture] = useState(false);
  const [retexturePrompt, setRetexturePrompt] = useState("");
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showMulticolorForm, setShowMulticolorForm] = useState(false);
  const [maxColors, setMaxColors] = useState(8);
  const [maxDepth, setMaxDepth] = useState(4);

  const [approvePending, startApprove] = useTransition();
  const [cancelPending, startCancel] = useTransition();
  const [revisionPending, startRevision] = useTransition();
  const [repairPending, startRepair] = useTransition();
  const [multicolorPending, startMulticolor] = useTransition();

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      const res = await pollGeneration(generationId);
      if (!res.ok) return;
      setGen((prev) => ({ ...prev, ...res.generation }));
      if (!MESHY_ACTIVE_STATUSES.includes(res.generation.status)) {
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }

  // Auto-start when the initially-loaded status is in-flight; cleanup on
  // unmount (mirrors whatsapp-connect-panel.tsx's useEffect(() => () =>
  // stopPolling(), []) pattern).
  useEffect(() => {
    if (MESHY_ACTIVE_STATUSES.includes(initial.status)) {
      startPolling();
    }
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Full refetch after any state-changing action — refreshes both the
   * generation row (status, printability, credits) AND the revisions list
   * (getGeneration re-joins meshy_revisions), then restarts polling if the
   * new status landed back in an active/in-flight state.
   */
  async function refreshAndMaybePoll() {
    const fresh = await getGeneration(generationId);
    if (!fresh) return;
    setGen(fresh);
    if (MESHY_ACTIVE_STATUSES.includes(fresh.status)) {
      startPolling();
    } else {
      stopPolling();
    }
  }

  function handleApprove() {
    setActionError(null);
    startApprove(async () => {
      const r = await approveGeneration(generationId);
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      await refreshAndMaybePoll();
    });
  }

  function handleCancel() {
    setActionError(null);
    startCancel(async () => {
      const r = await cancelGeneration(generationId);
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      await refreshAndMaybePoll();
    });
  }

  function handleRetextureSubmit() {
    setActionError(null);
    startRevision(async () => {
      const r = await requestRevision(generationId, {
        mode: "retexture",
        newTexturePrompt: retexturePrompt.trim() || undefined,
      });
      if (!r.ok) {
        setActionError(r.error === "RETEXTURE_EXPIRED" ? RETEXTURE_EXPIRED_MESSAGE : r.error);
        return;
      }
      setShowRetexture(false);
      setRetexturePrompt("");
      await refreshAndMaybePoll();
    });
  }

  function handleRegenerateConfirm() {
    setActionError(null);
    startRevision(async () => {
      const r = await requestRevision(generationId, { mode: "regenerate" });
      if (!r.ok) {
        setActionError(r.error === "RETEXTURE_EXPIRED" ? RETEXTURE_EXPIRED_MESSAGE : r.error);
        return;
      }
      setShowRegenerateConfirm(false);
      await refreshAndMaybePoll();
    });
  }

  function handleRepair() {
    setActionError(null);
    startRepair(async () => {
      const r = await requestRepair(generationId);
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      await refreshAndMaybePoll();
    });
  }

  function handleMulticolorSubmit() {
    setActionError(null);
    startMulticolor(async () => {
      const r = await runMulticolor(generationId, { maxColors, maxDepth });
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      setShowMulticolorForm(false);
      await refreshAndMaybePoll();
    });
  }

  const retextureExpired = gen.modelReadyAt
    ? Date.now() - new Date(gen.modelReadyAt).getTime() > MESHY_RETEXTURE_WINDOW_MS
    : true;

  function renderAwaitingReview() {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowRetexture((v) => !v)}
            disabled={retextureExpired}
            title={retextureExpired ? RETEXTURE_EXPIRED_MESSAGE : undefined}
            className="min-h-[48px] rounded-md border-2 px-4 py-2 text-sm font-bold disabled:opacity-50 transition-colors duration-150"
            style={{ borderColor: BRAND.ink, color: BRAND.ink, backgroundColor: "transparent" }}
          >
            Request Retexture
          </button>
          <button
            type="button"
            onClick={() => setShowRegenerateConfirm(true)}
            className="min-h-[48px] rounded-md border-2 px-4 py-2 text-sm font-bold transition-colors duration-150"
            style={{ borderColor: BRAND.ink, color: BRAND.ink, backgroundColor: "transparent" }}
          >
            Regenerate
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={approvePending}
            className="flex min-h-[48px] items-center gap-2 rounded-md px-6 py-2 text-sm font-bold text-white disabled:opacity-50 transition-colors duration-150"
            style={{ backgroundColor: BRAND.green }}
          >
            {approvePending && <Loader2 size={16} className="animate-spin" />}
            Approve
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelPending}
            className="min-h-[48px] rounded-md px-3 py-2 text-xs font-semibold text-slate-500 underline disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        {showRetexture && !retextureExpired ? (
          <div className="rounded-md border-2 p-3 space-y-2" style={{ borderColor: `${BRAND.ink}22` }}>
            <textarea
              value={retexturePrompt}
              onChange={(e) => setRetexturePrompt(e.target.value.slice(0, 600))}
              maxLength={600}
              rows={3}
              placeholder="Describe the new texture/style..."
              className="w-full rounded-md border p-2 text-sm"
              style={{ borderColor: `${BRAND.ink}22` }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{retexturePrompt.length}/600</span>
              <button
                type="button"
                onClick={handleRetextureSubmit}
                disabled={revisionPending}
                className="flex min-h-[40px] items-center gap-2 rounded-md px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: BRAND.blue }}
              >
                {revisionPending && <Loader2 size={14} className="animate-spin" />}
                Submit Retexture
              </button>
            </div>
          </div>
        ) : null}

        {showRegenerateConfirm ? (
          <div
            className="rounded-md border-2 p-3 space-y-2"
            style={{ borderColor: "#fca5a5", backgroundColor: "#fef2f2" }}
          >
            <p className="text-sm text-red-800">
              This creates a new full-price generation (~30 credits)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRegenerateConfirm}
                disabled={revisionPending}
                className="flex min-h-[40px] items-center gap-2 rounded-md px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: "#991b1b" }}
              >
                {revisionPending && <Loader2 size={14} className="animate-spin" />}
                Confirm Regenerate
              </button>
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(false)}
                className="min-h-[40px] rounded-md px-4 py-1.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderReadyActions() {
    if (gen.isMultiColor) return null;
    return (
      <div className="space-y-3">
        {!showMulticolorForm ? (
          <button
            type="button"
            onClick={() => setShowMulticolorForm(true)}
            className="min-h-[48px] rounded-md border-2 px-4 py-2 text-sm font-bold transition-colors duration-150"
            style={{ borderColor: BRAND.purple, color: BRAND.purple, backgroundColor: "transparent" }}
          >
            Run Multi-Color Conversion (10 credits)
          </button>
        ) : (
          <div className="rounded-md border-2 p-3 space-y-3" style={{ borderColor: `${BRAND.purple}44` }}>
            <div className="flex gap-4">
              <label className="text-sm" style={{ color: BRAND.ink }}>
                Colors
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={maxColors}
                  onChange={(e) => setMaxColors(Number(e.target.value))}
                  className="ml-2 w-16 rounded border px-2 py-1"
                  style={{ borderColor: `${BRAND.ink}22` }}
                />
              </label>
              <label className="text-sm" style={{ color: BRAND.ink }}>
                Depth
                <input
                  type="number"
                  min={3}
                  max={6}
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(Number(e.target.value))}
                  className="ml-2 w-16 rounded border px-2 py-1"
                  style={{ borderColor: `${BRAND.ink}22` }}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleMulticolorSubmit}
              disabled={multicolorPending}
              className="flex min-h-[44px] items-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND.purple }}
            >
              {multicolorPending && <Loader2 size={16} className="animate-spin" />}
              Start Conversion
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderFailedBanner() {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 p-5 space-y-2">
        <p className="font-bold text-red-800">{gen.taskErrorType ?? "Generation failed"}</p>
        <p className="text-sm text-red-700">
          {gen.taskErrorMessage ?? "An unknown error occurred."}
        </p>
        <Link
          href="/admin/meshy/new"
          className="inline-block font-semibold underline"
          style={{ color: BRAND.blue }}
        >
          Try Again
        </Link>
      </div>
    );
  }

  function renderCanceledBanner() {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: `${BRAND.ink}0d`, color: BRAND.ink }}>
        <p className="font-bold">Generation canceled.</p>
      </div>
    );
  }

  function renderActionArea() {
    switch (gen.status) {
      case "generating":
      case "revising":
      case "analyzing":
      case "repairing":
      case "processing_multicolor":
        return <GhostStatusButton label={GHOST_LABELS[gen.status] ?? "Working..."} />;
      case "awaiting_review":
        return renderAwaitingReview();
      case "ready":
        return renderReadyActions();
      case "failed":
        return renderFailedBanner();
      case "canceled":
        return renderCanceledBanner();
      default:
        return null;
    }
  }

  const canRepair =
    gen.status === "ready" &&
    (gen.printabilityStatus === "warning" || gen.printabilityStatus === "error");

  return (
    <div>
      <header className="mb-6 space-y-2">
        <Link
          href="/admin/meshy"
          className="text-sm font-semibold underline"
          style={{ color: BRAND.blue }}
        >
          ← Back to Meshy Generations
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-[var(--font-heading)] text-2xl md:text-3xl" style={{ color: BRAND.ink }}>
            {gen.texturePrompt || "Untitled generation"}
          </h1>
          <AdminMeshyStatusBadge status={gen.status} />
        </div>
        <p className="text-sm text-slate-600">
          Created{" "}
          {new Date(gen.createdAt).toLocaleString("en-MY", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <AdminMeshyModelViewer
            generationId={generationId}
            hasLocalGlb={!!gen.localModelFiles.glb}
            statusLabel={GHOST_LABELS[gen.status]}
          />

          {actionError ? (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
            >
              {actionError}
            </div>
          ) : null}

          {renderActionArea()}

          <AdminMeshyRevisionHistory revisions={gen.revisions} />
        </div>

        <div className="space-y-6 lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
          {gen.printabilityStatus ? (
            <AdminMeshyPrintabilityCard
              status={gen.printabilityStatus}
              report={gen.printabilityReport}
              onRepair={handleRepair}
              repairPending={repairPending}
              canRepair={canRepair}
            />
          ) : null}

          <section className="rounded-xl bg-white p-4">
            <p className="text-right text-sm font-semibold tabular-nums" style={{ color: BRAND.ink }}>
              {gen.creditsUsed} credits used
            </p>
          </section>

          {gen.status === "ready" ? (
            <section className="rounded-xl bg-white p-5 space-y-3">
              <h2 className="font-[var(--font-heading)] text-lg" style={{ color: BRAND.ink }}>
                Downloads
              </h2>
              <a
                href={`/api/admin/meshy/${generationId}/download?file=stl`}
                className="flex min-h-[48px] items-center justify-center rounded-md px-4 py-2 text-sm font-bold text-white transition-colors duration-150"
                style={{ backgroundColor: BRAND.blue }}
              >
                Download STL
              </a>
              {gen.isMultiColor && gen.localModelFiles.threeMf ? (
                <a
                  href={`/api/admin/meshy/${generationId}/download?file=3mf`}
                  className="flex min-h-[48px] items-center justify-center rounded-md px-4 py-2 text-sm font-bold text-white transition-colors duration-150"
                  style={{ backgroundColor: BRAND.purple }}
                >
                  Download 3MF
                </a>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
