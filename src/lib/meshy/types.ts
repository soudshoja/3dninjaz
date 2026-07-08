/**
 * Phase 21 (21-02) — shared Meshy vocabulary module.
 *
 * Pure types + pure parse helpers. No execution-environment directives at
 * all — both client components (status badges, polling UI) and server code
 * (client.ts, storage.ts, pipeline.ts, actions) import from here.
 *
 * MariaDB stores JSON columns as LONGTEXT (CLAUDE.md gotcha) — mysql2 does
 * NOT auto-parse. parseLocalModelFiles / parsePrintabilityReport are the
 * SINGLE defensive parse-helper pair for this feature (21-PATTERNS §8 item 1:
 * write one pair, not per-call-site copies like the repo's 5+ duplicated
 * ensureImagesArray()s).
 */

export type MeshyGenerationStatus =
  | "generating"
  | "awaiting_review"
  | "revising"
  | "analyzing"
  | "repairing"
  | "processing_multicolor"
  | "ready"
  | "failed"
  | "canceled";

export type PrintabilityStatus = "healthy" | "warning" | "error" | "unknown";

export type LocalModelFiles = {
  glb?: string;
  stl?: string;
  threeMf?: string;
};

export type PrintabilityReport = {
  is_watertight?: boolean;
  volume?: number;
  non_manifold_edge_count?: number;
  degenerate_face_count?: number;
  hole_count?: number;
};

/**
 * Defensive parse of the local_model_files JSON column. MariaDB returns
 * LONGTEXT strings, not parsed objects — mirrors ensureImagesArray's shape
 * (src/actions/wishlist.ts:29-46) but picks a fixed set of string fields
 * instead of filtering an array.
 */
export function parseLocalModelFiles(raw: unknown): LocalModelFiles {
  if (raw === null || raw === undefined) return {};

  let candidate: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return {};
    try {
      candidate = JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return {};
  }

  const obj = candidate as Record<string, unknown>;
  const result: LocalModelFiles = {};
  if (typeof obj.glb === "string") result.glb = obj.glb;
  if (typeof obj.stl === "string") result.stl = obj.stl;
  if (typeof obj.threeMf === "string") result.threeMf = obj.threeMf;
  return result;
}

/**
 * Defensive parse of the printability_report JSON column. Returns null on
 * null/garbage input (no report exists yet) rather than an empty object,
 * so callers can distinguish "not analyzed" from "analyzed, all fields
 * absent".
 */
export function parsePrintabilityReport(raw: unknown): PrintabilityReport | null {
  if (raw === null || raw === undefined) return null;

  let candidate: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return null;
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return null;
  }

  const obj = candidate as Record<string, unknown>;
  const report: PrintabilityReport = {};
  if (typeof obj.is_watertight === "boolean") report.is_watertight = obj.is_watertight;
  if (typeof obj.volume === "number") report.volume = obj.volume;
  if (typeof obj.non_manifold_edge_count === "number") {
    report.non_manifold_edge_count = obj.non_manifold_edge_count;
  }
  if (typeof obj.degenerate_face_count === "number") {
    report.degenerate_face_count = obj.degenerate_face_count;
  }
  if (typeof obj.hole_count === "number") report.hole_count = obj.hole_count;
  return report;
}

/**
 * Documented-rate estimates (api-reference.md pricing snapshot). Reconciling
 * against real balance deltas is deferred — these are for the pre-flight
 * soft-cap warning only, not billing-accurate accounting.
 */
export const MESHY_CREDIT_COSTS = {
  generation: 30,
  retexture: 10,
  repair: 10,
  multicolor: 10,
  analyze: 0,
} as const;

/** Resolved open question #1: warn-only soft cap, no hard block. */
export const MESHY_LOW_BALANCE_WARN = 100;

/**
 * 3-day asset expiry (21-CONTEXT hard constraint). Retexture's
 * input_task_id reliability past this window is unverified — UI should
 * fall back to regenerate after this elapses since the source task.
 */
export const MESHY_RETEXTURE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 10MB cap on the admin's uploaded reference photo. Lower than the repo's
 * general 50MB upload cap because the photo travels to Meshy as a base64
 * data URI (§storage.ts) — base64 inflates payload size ~33%, and Meshy's
 * own image-to-3d endpoint has no need for a huge source photo.
 */
export const MESHY_SOURCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Statuses considered "in flight" — shared by the client poll-stop logic
 * (admin-meshy-detail.tsx) and the cron reconciliation sweep
 * (scripts/meshy-sweep.ts) to select stuck rows.
 */
export const MESHY_ACTIVE_STATUSES: MeshyGenerationStatus[] = [
  "generating",
  "revising",
  "analyzing",
  "repairing",
  "processing_multicolor",
];
