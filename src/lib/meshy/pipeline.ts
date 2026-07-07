/**
 * Phase 21 (21-03) — advanceGeneration(id), the ONE state machine.
 *
 * This module carries no execution-environment directives and imports
 * nothing from the App Router's request-scoped runtime, so the Wave-3 cron
 * sweep (scripts/meshy-sweep.ts) can load it directly under tsx without
 * pulling in any of that. Revalidation (cache invalidation) happens in the
 * Server Action layer (src/actions/admin-meshy.ts), never here.
 *
 * Both the client poll action (pollGeneration) and the cron sweep call this
 * exact function — that's the whole point of centralizing the state
 * machine in one place (21-CONTEXT: "designed around one shared
 * advanceGeneration(id) state-machine function").
 *
 * 3-day asset expiry rule (21-CONTEXT, non-negotiable): every SUCCEEDED
 * Meshy task's files MUST be downloaded to our private storage BEFORE the
 * row advances to its next workflow status. On a persist failure in
 * production we leave the row's status untouched so the next poll/sweep
 * tick retries the download (Meshy keeps files for 3 days) — we only
 * tolerate a partial/failed persist and advance anyway when running
 * against the dev test-mode key, whose asset URLs are fake/unreachable by
 * design (accepted dev limitation, 21-CONTEXT).
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { meshyGenerations, meshyRevisions } from "@/lib/db/schema";
import {
  getImageTo3DTask,
  getRetextureTask,
  getPrintabilityAnalysis,
  getRepairTask,
  getMultiColorTask,
  analyzePrintability,
  isMeshyTestMode,
  MeshyHttpError,
  type GenerationTaskResult,
  type TaskStatus,
} from "@/lib/meshy/client";
import { downloadMeshyAsset } from "@/lib/meshy/storage";
import {
  parseLocalModelFiles,
  parsePrintabilityReport,
  MESHY_ACTIVE_STATUSES,
  type LocalModelFiles,
  type MeshyGenerationStatus,
  type PrintabilityStatus,
} from "@/lib/meshy/types";

type GenerationRow = typeof meshyGenerations.$inferSelect;
type RevisionRow = typeof meshyRevisions.$inferSelect;

/**
 * Single select + JSON-parse of a meshy_generations row. Shared by the
 * pipeline internals, the action layer, and the download route so there is
 * only one place that knows how to turn the raw DB row into parsed JSON
 * fields.
 */
export async function getGenerationRow(id: string): Promise<
  | (Omit<GenerationRow, "localModelFiles" | "printabilityReport"> & {
      localModelFiles: LocalModelFiles;
      printabilityReport: ReturnType<typeof parsePrintabilityReport>;
    })
  | null
> {
  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    localModelFiles: parseLocalModelFiles(row.localModelFiles),
    printabilityReport: parsePrintabilityReport(row.printabilityReport),
  };
}

/**
 * Downloads the SUCCEEDED task's thumbnail + model files to private
 * storage. Returns ok=true only when every attempted download succeeded.
 * Caller merges the returned files over the row's existing
 * parseLocalModelFiles() result (a later stage — e.g. a retexture SUCCEEDED
 * — should not clobber a thumbnail from an earlier stage if it didn't
 * return a new one).
 */
async function persistModelAssets(
  generationId: string,
  task: GenerationTaskResult,
): Promise<{ ok: boolean; files: LocalModelFiles; thumbPath?: string }> {
  const files: LocalModelFiles = {};
  let ok = true;
  let thumbPath: string | undefined;

  if (task.thumbnail_url) {
    const r = await downloadMeshyAsset(task.thumbnail_url, generationId, "thumb.png");
    if (r.ok) {
      thumbPath = r.relPath;
    } else {
      ok = false;
      console.warn(`[meshy-pipeline] thumbnail download failed for ${generationId}: ${r.error}`);
    }
  }

  if (task.model_urls?.glb) {
    const r = await downloadMeshyAsset(task.model_urls.glb, generationId, "model.glb");
    if (r.ok) {
      files.glb = r.relPath;
    } else {
      ok = false;
      console.warn(`[meshy-pipeline] glb download failed for ${generationId}: ${r.error}`);
    }
  }

  if (task.model_urls?.stl) {
    const r = await downloadMeshyAsset(task.model_urls.stl, generationId, "model.stl");
    if (r.ok) {
      files.stl = r.relPath;
    } else {
      ok = false;
      console.warn(`[meshy-pipeline] stl download failed for ${generationId}: ${r.error}`);
    }
  }

  return { ok, files, thumbPath };
}

/** Normalizes a merged LocalModelFiles object to a plain JSON-safe value
 * (drops any explicit-undefined keys) before handing it to Drizzle's json()
 * column, which serializes the value itself on write — this round-trip is
 * a defensive normalization step, not a substitute for that serialization. */
function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function latestRevision(generationId: string): Promise<RevisionRow | null> {
  const [row] = await db
    .select()
    .from(meshyRevisions)
    .where(eq(meshyRevisions.generationId, generationId))
    .orderBy(desc(meshyRevisions.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * The one state machine. Loads the row, no-ops on missing/terminal status,
 * otherwise polls the correct per-stage Meshy endpoint and advances the row
 * exactly one step. Never throws on a transient Meshy network error — a
 * blip must never wedge a row into "failed"; it just returns the row
 * unchanged so the next tick retries.
 */
export async function advanceGeneration(id: string): Promise<GenerationRow | null> {
  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  if (!row) return null;

  if (!MESHY_ACTIVE_STATUSES.includes(row.status as MeshyGenerationStatus)) {
    return row;
  }

  switch (row.status as MeshyGenerationStatus) {
    case "generating":
      return advanceGenerating(row);
    case "revising":
      return advanceRevising(row);
    case "analyzing":
      return advanceAnalyzing(row);
    case "repairing":
      return advanceRepairing(row);
    case "processing_multicolor":
      return advanceMulticolor(row);
    default:
      return row;
  }
}

async function advanceGenerating(row: GenerationRow): Promise<GenerationRow> {
  if (!row.meshyTaskId) return row;

  let task: GenerationTaskResult;
  try {
    task = await getImageTo3DTask(row.meshyTaskId);
  } catch (err) {
    logTransient("generating", row.id, err);
    return row;
  }

  if (task.status === "SUCCEEDED") {
    const persisted = await persistModelAssets(row.id, task);
    const testMode = isMeshyTestMode();

    if (!persisted.ok && !testMode) {
      // Prod: leave status untouched so the next poll/sweep tick retries the
      // download — Meshy keeps files for 3 days.
      return row;
    }

    const existing = parseLocalModelFiles(row.localModelFiles);
    const mergedFiles: LocalModelFiles = toJsonSafe({ ...existing, ...persisted.files });

    await db
      .update(meshyGenerations)
      .set({
        localModelFiles: mergedFiles,
        localThumbnailPath: persisted.thumbPath ?? row.localThumbnailPath,
        status: "awaiting_review",
        modelReadyAt: new Date(),
        taskErrorType: null,
        taskErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  if (task.status === "FAILED") {
    // Never auto-retry here — even timeout/service_unavailable retry
    // decisions belong to the admin (Try Again button), because generation
    // costs 30cr (SKILL.md §0.3).
    console.warn(
      `[meshy-pipeline] generation ${row.id} FAILED: ${JSON.stringify(task.task_error ?? {})}`,
    );
    await db
      .update(meshyGenerations)
      .set({
        status: "failed",
        taskErrorType: task.task_error?.type ?? "unknown",
        taskErrorMessage: task.task_error?.message ?? "",
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  // PENDING / IN_PROGRESS -> no write.
  return row;
}

async function advanceRevising(row: GenerationRow): Promise<GenerationRow> {
  const revision = await latestRevision(row.id);
  if (!revision || !revision.meshyTaskId) return row;

  let task: GenerationTaskResult;
  try {
    task =
      revision.endpointUsed === "retexture"
        ? await getRetextureTask(revision.meshyTaskId)
        : await getImageTo3DTask(revision.meshyTaskId);
  } catch (err) {
    logTransient("revising", row.id, err);
    return row;
  }

  if (task.status === "SUCCEEDED") {
    const persisted = await persistModelAssets(row.id, task);
    const testMode = isMeshyTestMode();

    if (!persisted.ok && !testMode) {
      return row;
    }

    const existing = parseLocalModelFiles(row.localModelFiles);
    const mergedFiles: LocalModelFiles = toJsonSafe({ ...existing, ...persisted.files });

    await db
      .update(meshyGenerations)
      .set({
        // The revision task becomes the CURRENT model's task
        // ("meshyTaskId = current model's task", 21-CONTEXT).
        meshyTaskId: revision.meshyTaskId,
        localModelFiles: mergedFiles,
        localThumbnailPath: persisted.thumbPath ?? row.localThumbnailPath,
        status: "awaiting_review",
        modelReadyAt: new Date(),
        // Stale analysis invalidated by the new model.
        printabilityStatus: null,
        printabilityReport: null,
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  if (task.status === "FAILED") {
    if (revision.endpointUsed === "retexture") {
      // Previous model is intact — admin sees the error banner but keeps
      // the old model.
      await db
        .update(meshyGenerations)
        .set({
          status: "awaiting_review",
          taskErrorType: task.task_error?.type ?? "unknown",
          taskErrorMessage: task.task_error?.message ?? "",
          updatedAt: new Date(),
        })
        .where(eq(meshyGenerations.id, row.id));
    } else {
      // Regenerate FAILED -> nothing to fall back to.
      await db
        .update(meshyGenerations)
        .set({
          status: "failed",
          taskErrorType: task.task_error?.type ?? "unknown",
          taskErrorMessage: task.task_error?.message ?? "",
          updatedAt: new Date(),
        })
        .where(eq(meshyGenerations.id, row.id));
    }
    return (await refetch(row.id)) ?? row;
  }

  return row;
}

/**
 * getPrintabilityAnalysis's declared return type intersects
 * GenerationTaskResult.status (TaskStatus: PENDING/IN_PROGRESS/SUCCEEDED/
 * FAILED/CANCELED) with PrintabilityResult.status (healthy/warning/error/
 * unknown) — two disjoint string-literal unions collapse to `never` under
 * `&`, which the compiler rejects on comparison. The real Meshy analyze
 * endpoint overloads a single `status` key: while the task is running it
 * holds the generic lifecycle value, and once analysis is done it holds the
 * printability verdict instead of "SUCCEEDED" (matching api-reference.md,
 * which never mentions "SUCCEEDED" for this endpoint at all). We read the
 * raw value once through `unknown` and branch on its actual runtime string.
 */
async function advanceAnalyzing(row: GenerationRow): Promise<GenerationRow> {
  if (!row.meshyAnalyzeTaskId) return row;

  let raw: GenerationTaskResult;
  try {
    raw = await getPrintabilityAnalysis(row.meshyAnalyzeTaskId);
  } catch (err) {
    logTransient("analyzing", row.id, err);
    return row;
  }

  const analyzed = raw as unknown as {
    status: TaskStatus | PrintabilityStatus;
    task_error?: { type: string; message: string };
    is_watertight?: boolean;
    volume?: number;
    non_manifold_edge_count?: number;
    degenerate_face_count?: number;
    hole_count?: number;
  };

  const healthValues: PrintabilityStatus[] = ["healthy", "warning", "error", "unknown"];
  const isAnalysisDone = healthValues.includes(analyzed.status as PrintabilityStatus);

  if (isAnalysisDone) {
    const finalStatus: PrintabilityStatus = analyzed.status as PrintabilityStatus;

    const report: Record<string, unknown> = {};
    if (typeof analyzed.is_watertight === "boolean") report.is_watertight = analyzed.is_watertight;
    if (typeof analyzed.volume === "number") report.volume = analyzed.volume;
    if (typeof analyzed.non_manifold_edge_count === "number") {
      report.non_manifold_edge_count = analyzed.non_manifold_edge_count;
    }
    if (typeof analyzed.degenerate_face_count === "number") {
      report.degenerate_face_count = analyzed.degenerate_face_count;
    }
    if (typeof analyzed.hole_count === "number") report.hole_count = analyzed.hole_count;

    await db
      .update(meshyGenerations)
      .set({
        printabilityStatus: finalStatus,
        printabilityReport: toJsonSafe(report),
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  if (analyzed.status === "FAILED") {
    // Analyze is free + non-critical — do not fail the generation.
    console.warn(`[meshy-pipeline] analyze failed for ${row.id}, marking printability unknown`);
    await db
      .update(meshyGenerations)
      .set({
        printabilityStatus: "unknown",
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  // PENDING / IN_PROGRESS -> no write.
  return row;
}

async function advanceRepairing(row: GenerationRow): Promise<GenerationRow> {
  if (!row.meshyRepairTaskId) return row;

  let task: GenerationTaskResult;
  try {
    task = await getRepairTask(row.meshyRepairTaskId);
  } catch (err) {
    logTransient("repairing", row.id, err);
    return row;
  }

  if (task.status === "SUCCEEDED") {
    // Repair output format mirrors input — download whichever of glb/stl
    // came back, merging over the existing localModelFiles.
    const persisted = await persistModelAssets(row.id, task);
    const existing = parseLocalModelFiles(row.localModelFiles);
    const mergedFiles: LocalModelFiles = toJsonSafe({ ...existing, ...persisted.files });

    // Chain a FREE re-analyze so printabilityStatus stays honest post-repair.
    // Repair itself only ever fires from the explicit-click action — this
    // chained call is the free analyze endpoint, not another paid repair.
    let newAnalyzeId: string | null = null;
    try {
      newAnalyzeId = await analyzePrintability({ input_task_id: row.meshyRepairTaskId });
    } catch (err) {
      console.warn(`[meshy-pipeline] post-repair analyze kickoff failed for ${row.id}:`, err);
    }

    await db
      .update(meshyGenerations)
      .set({
        localModelFiles: mergedFiles,
        localThumbnailPath: persisted.thumbPath ?? row.localThumbnailPath,
        meshyAnalyzeTaskId: newAnalyzeId ?? row.meshyAnalyzeTaskId,
        // If the free re-analyze kickoff itself failed to even start, fall
        // back straight to "ready" rather than wedging the row in
        // "repairing" forever waiting on an analyze task id that was never
        // created.
        status: newAnalyzeId ? "analyzing" : "ready",
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  if (task.status === "FAILED") {
    // Repaired nothing but the model still exists.
    await db
      .update(meshyGenerations)
      .set({
        status: "ready",
        taskErrorType: task.task_error?.type ?? "unknown",
        taskErrorMessage: task.task_error?.message ?? "",
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  return row;
}

async function advanceMulticolor(row: GenerationRow): Promise<GenerationRow> {
  if (!row.meshyMulticolorTaskId) return row;

  let task: GenerationTaskResult;
  try {
    task = await getMultiColorTask(row.meshyMulticolorTaskId);
  } catch (err) {
    logTransient("processing_multicolor", row.id, err);
    return row;
  }

  if (task.status === "SUCCEEDED") {
    const existing = parseLocalModelFiles(row.localModelFiles);
    let mergedFiles: LocalModelFiles = { ...existing };
    const testMode = isMeshyTestMode();

    if (task.model_urls?.["3mf"]) {
      const r = await downloadMeshyAsset(task.model_urls["3mf"], row.id, "model.3mf");
      if (r.ok) {
        mergedFiles = { ...mergedFiles, threeMf: r.relPath };
      } else if (!testMode) {
        // Same test-mode tolerance as branch 1 — dev's fake URLs never
        // download successfully, but prod must retry.
        console.warn(`[meshy-pipeline] 3mf download failed for ${row.id}: ${r.error}`);
        return row;
      }
    }

    await db
      .update(meshyGenerations)
      .set({
        localModelFiles: toJsonSafe(mergedFiles),
        isMultiColor: true,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  if (task.status === "FAILED") {
    await db
      .update(meshyGenerations)
      .set({
        status: "ready",
        taskErrorType: task.task_error?.type ?? "unknown",
        taskErrorMessage: task.task_error?.message ?? "",
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, row.id));
    return (await refetch(row.id)) ?? row;
  }

  return row;
}

async function refetch(id: string): Promise<GenerationRow | null> {
  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  return row ?? null;
}

function logTransient(stage: string, generationId: string, err: unknown): void {
  if (err instanceof MeshyHttpError) {
    console.warn(
      `[meshy-pipeline] transient Meshy HTTP error in ${stage} for ${generationId}: ${err.status} ${err.message}`,
    );
    return;
  }
  console.warn(`[meshy-pipeline] transient error in ${stage} for ${generationId}:`, err);
}
