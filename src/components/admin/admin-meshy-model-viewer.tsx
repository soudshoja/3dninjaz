"use client";

import { useEffect } from "react";

/**
 * Phase 21 (21-07) — 3D preview primitive for the Meshy detail cockpit.
 *
 * The "never a blank box" rule (21-UI-SPEC §Page 3, direct lesson from the
 * keychain-3D-preview incident this session): while no local glb exists yet
 * we render the admin's own uploaded source photo with a pulsing overlay +
 * status caption instead — never nothing.
 *
 * The `<model-viewer>` src is ALWAYS the locally-persisted file served
 * through the authed download route (the "glb" kind on the download route
 * below) — never a remote Meshy-hosted URL, which expires after ~3 days.
 */

interface AdminMeshyModelViewerProps {
  generationId: string;
  hasLocalGlb: boolean;
  statusLabel?: string;
}

export function AdminMeshyModelViewer({
  generationId,
  hasLocalGlb,
  statusLabel,
}: AdminMeshyModelViewerProps) {
  // Client-only web-component registration — @google/model-viewer must never
  // be imported during SSR (it touches `customElements`/`document`).
  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  if (hasLocalGlb) {
    return (
      <div className="aspect-square w-full overflow-hidden rounded-2xl bg-white">
        <model-viewer
          src={`/api/admin/meshy/${generationId}/download?file=glb`}
          alt="Generated 3D model"
          camera-controls
          auto-rotate
          shadow-intensity="1"
          exposure="1"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/admin/meshy/${generationId}/download?file=source`}
        alt="Uploaded reference photo"
        className="h-full w-full object-cover"
      />
      <div className="animate-pulse absolute inset-0 border-4 border-white/60 rounded-2xl" />
      <div className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-2 text-center text-sm font-semibold text-white">
        {statusLabel ?? "Generating 3D model..."}
      </div>
    </div>
  );
}
