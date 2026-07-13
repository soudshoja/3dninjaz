"use server";

import { randomUUID } from "node:crypto";
import { count, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { meshyGenerations, meshyRevisions } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import { advanceGeneration } from "@/lib/meshy/pipeline";
import {
  createImageTo3DTask,
  createRetextureTask,
  analyzePrintability,
  repairPrintability,
  createMultiColorPrint,
  getBalance,
  MeshyHttpError,
} from "@/lib/meshy/client";
import { writeSourceImage, readSourceImageAsDataUri } from "@/lib/meshy/storage";
import {
  parseLocalModelFiles,
  parsePrintabilityReport,
  MESHY_CREDIT_COSTS,
  MESHY_LOW_BALANCE_WARN,
  MESHY_RETEXTURE_WINDOW_MS,
  MESHY_SOURCE_IMAGE_MAX_BYTES,
  type LocalModelFiles,
  type PrintabilityReport,
  type MeshyGenerationStatus,
  type PrintabilityStatus,
} from "@/lib/meshy/types";
import * as rateLimiter from "@/lib/rate-limit";

/**
 * Phase 21 (21-03) — the full admin-meshy Server Action surface.
 *
 * Every export awaits requireAdmin() as its literal first statement
 * (CVE-2025-29927 mitigation — middleware-only protection is bypassable).
 * All results are discriminated unions ({ ok: true, ... } | { ok: false,
 * error }); no export ever throws to the client.
 *
 * Credit spend discipline (21-CONTEXT, locked): analyze is FREE and always
 * runs on approval; repair NEVER auto-fires — it is its own explicit-click
 * action, fired only by repairGeneration below; every paid action checks
 * getBalance() first and is rate-limited.
 */

type GenerationRow = typeof meshyGenerations.$inferSelect;
type RevisionRow = typeof meshyRevisions.$inferSelect;

export type SerializedGeneration = {
  id: string;
  adminUserId: string;
  productId: string | null;
  sourceImagePath: string;
  texturePrompt: string | null;
  aiModel: string;
  status: MeshyGenerationStatus;
  meshyTaskId: string | null;
  meshyAnalyzeTaskId: string | null;
  meshyRepairTaskId: string | null;
  meshyMulticolorTaskId: string | null;
  printabilityStatus: PrintabilityStatus | null;
  printabilityReport: PrintabilityReport | null;
  isMultiColor: boolean;
  localThumbnailPath: string | null;
  localModelFiles: LocalModelFiles;
  creditsUsed: number;
  taskErrorType: string | null;
  taskErrorMessage: string | null;
  modelReadyAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedRevision = {
  id: string;
  generationId: string;
  revisionNumber: number;
  endpointUsed: string;
  changeNote: string | null;
  newTexturePrompt: string | null;
  meshyTaskId: string | null;
  creditsUsed: number;
  createdAt: string;
};

function serializeGeneration(row: GenerationRow): SerializedGeneration {
  return {
    id: row.id,
    adminUserId: row.adminUserId,
    productId: row.productId,
    sourceImagePath: row.sourceImagePath,
    texturePrompt: row.texturePrompt,
    aiModel: row.aiModel,
    status: row.status as MeshyGenerationStatus,
    meshyTaskId: row.meshyTaskId,
    meshyAnalyzeTaskId: row.meshyAnalyzeTaskId,
    meshyRepairTaskId: row.meshyRepairTaskId,
    meshyMulticolorTaskId: row.meshyMulticolorTaskId,
    printabilityStatus: row.printabilityStatus as PrintabilityStatus | null,
    printabilityReport: parsePrintabilityReport(row.printabilityReport),
    isMultiColor: row.isMultiColor,
    localThumbnailPath: row.localThumbnailPath,
    localModelFiles: parseLocalModelFiles(row.localModelFiles),
    creditsUsed: row.creditsUsed,
    taskErrorType: row.taskErrorType,
    taskErrorMessage: row.taskErrorMessage,
    modelReadyAt: row.modelReadyAt ? row.modelReadyAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRevision(row: RevisionRow): SerializedRevision {
  return {
    id: row.id,
    generationId: row.generationId,
    revisionNumber: row.revisionNumber,
    endpointUsed: row.endpointUsed,
    changeNote: row.changeNote,
    newTexturePrompt: row.newTexturePrompt,
    meshyTaskId: row.meshyTaskId,
    creditsUsed: row.creditsUsed,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Warn-only soft credit guard (resolved open question #1 — no monthly
 * counter table, no hard cap). On a getBalance() API failure, skip the
 * guard entirely and log a warning — availability beats strictness, since
 * a Meshy outage shouldn't block the admin from attempting a generation
 * whose own call would fail on its own merits anyway.
 */
async function checkBalanceGuard(
  cost: number,
): Promise<{ ok: true; balance: number | null } | { ok: false; error: string }> {
  try {
    const { balance } = await getBalance();
    if (balance < cost) {
      return {
        ok: false,
        error: `Insufficient Meshy credits (balance ${balance}, need ${cost})`,
      };
    }
    return { ok: true, balance };
  } catch (err) {
    console.warn("[meshy] balance check failed, skipping guard:", err);
    return { ok: true, balance: null };
  }
}

// ============================================================================
// createGeneration
// ============================================================================

export type CreateGenerationResult =
  | { ok: true; id: string; lowBalance: boolean }
  | { ok: false; error: string };

export async function createGeneration(formData: FormData): Promise<CreateGenerationResult> {
  const { db, ...session } = await requireAdmin();

  const photo = formData.get("photo");
  if (!(photo instanceof File) || !photo.type || photo.size === 0) {
    return { ok: false, error: "Photo is required." };
  }
  if (photo.type !== "image/jpeg" && photo.type !== "image/png") {
    return { ok: false, error: "Photo must be JPEG or PNG." };
  }
  if (photo.size > MESHY_SOURCE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Photo exceeds 10MB." };
  }

  const rawPrompt = formData.get("texture_prompt");
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
  if (prompt.length > 600) {
    return { ok: false, error: "Style prompt exceeds 600 characters." };
  }

  const guard = await checkBalanceGuard(MESHY_CREDIT_COSTS.generation);
  if (!guard.ok) return { ok: false, error: guard.error };
  const lowBalance = guard.balance !== null && guard.balance < MESHY_LOW_BALANCE_WARN;

  const generationId = randomUUID();
  const written = await writeSourceImage(generationId, photo);
  if (!written.ok) return { ok: false, error: written.error };

  let taskId: string;
  try {
    const dataUri = await readSourceImageAsDataUri(written.relPath);
    taskId = await createImageTo3DTask({
      image_url: dataUri,
      should_texture: true,
      texture_prompt: prompt || undefined,
      ai_model: "meshy-6",
      moderation: true,
      // 3mf is NOT requested here — a colored 3MF only ever comes from
      // print/multi-color (21-CONTEXT); target_formats is explicit so an
      // STL exists for print download.
      target_formats: ["glb", "stl"],
    });
  } catch (err) {
    if (err instanceof MeshyHttpError && err.status === 402) {
      return { ok: false, error: "Meshy account is out of credits." };
    }
    console.error("[meshy] createGeneration task creation failed:", err);
    return { ok: false, error: "Could not start generation. Try again shortly." };
  }

  try {
    await db.insert(meshyGenerations).values({
      id: generationId,
      adminUserId: session.user.id,
      sourceImagePath: written.relPath,
      texturePrompt: prompt || null,
      aiModel: "meshy-6",
      status: "generating",
      meshyTaskId: taskId,
      creditsUsed: MESHY_CREDIT_COSTS.generation,
    });
  } catch (err) {
    console.error("[meshy] createGeneration insert failed:", err);
    return { ok: false, error: "Could not save generation record." };
  }

  revalidatePath("/admin/meshy");
  return { ok: true, id: generationId, lowBalance };
}

// ============================================================================
// pollGeneration
// ============================================================================

export type PollGenerationResult =
  | { ok: true; generation: SerializedGeneration }
  | { ok: false; error: string };

export async function pollGeneration(id: string): Promise<PollGenerationResult> {
  const { db } = await requireAdmin();

  const row = await advanceGeneration(id, db);
  if (!row) return { ok: false, error: "Not found" };

  return { ok: true, generation: serializeGeneration(row) };
}

// ============================================================================
// listGenerations
// ============================================================================

export type GenerationListRow = {
  id: string;
  texturePrompt: string | null;
  status: MeshyGenerationStatus;
  creditsUsed: number;
  createdAt: string;
  localThumbnailPath: string | null;
  revisionCount: number;
};

export async function listGenerations(): Promise<GenerationListRow[]> {
  const { db } = await requireAdmin();

  const rows = await db
    .select()
    .from(meshyGenerations)
    .orderBy(desc(meshyGenerations.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const revisionCounts = await db
    .select({ generationId: meshyRevisions.generationId, cnt: count() })
    .from(meshyRevisions)
    .where(inArray(meshyRevisions.generationId, ids))
    .groupBy(meshyRevisions.generationId);

  const countByGeneration = new Map(revisionCounts.map((r) => [r.generationId, r.cnt]));

  return rows.map((r) => ({
    id: r.id,
    texturePrompt: r.texturePrompt,
    status: r.status as MeshyGenerationStatus,
    creditsUsed: r.creditsUsed,
    createdAt: r.createdAt.toISOString(),
    localThumbnailPath: r.localThumbnailPath,
    revisionCount: countByGeneration.get(r.id) ?? 0,
  }));
}

// ============================================================================
// getGeneration
// ============================================================================

export type GenerationDetail = SerializedGeneration & {
  revisions: SerializedRevision[];
};

export async function getGeneration(id: string): Promise<GenerationDetail | null> {
  const { db } = await requireAdmin();

  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  if (!row) return null;

  const revisionRows = await db
    .select()
    .from(meshyRevisions)
    .where(eq(meshyRevisions.generationId, id))
    .orderBy(desc(meshyRevisions.createdAt));

  return {
    ...serializeGeneration(row),
    revisions: revisionRows.map(serializeRevision),
  };
}

// ============================================================================
// requestRevision
// ============================================================================

export type RequestRevisionResult = { ok: true } | { ok: false; error: string };

export type RequestRevisionInput = {
  mode: "retexture" | "regenerate";
  changeNote?: string;
  newTexturePrompt?: string;
};

export async function requestRevision(
  id: string,
  input: RequestRevisionInput,
): Promise<RequestRevisionResult> {
  const { db, ...session } = await requireAdmin();

  const limit = rateLimiter.checkRateLimit(`meshy-revise:${session.user.id}`, 10, 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many revision requests; try again in ${Math.ceil(limit.retryAfterMs / 1000)}s.`,
    };
  }

  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Generation not found." };
  if (row.status !== "awaiting_review") {
    return { ok: false, error: "Model is not awaiting review." };
  }

  const changeNote = input.changeNote?.trim() ?? "";
  if (changeNote.length > 1000) {
    return { ok: false, error: "Change note exceeds 1000 characters." };
  }
  const newTexturePrompt = input.newTexturePrompt?.trim() ?? "";
  if (newTexturePrompt.length > 600) {
    return { ok: false, error: "Style prompt exceeds 600 characters." };
  }

  let taskId: string;
  let cost: number;

  if (input.mode === "retexture") {
    if (!row.modelReadyAt || Date.now() - row.modelReadyAt.getTime() > MESHY_RETEXTURE_WINDOW_MS) {
      return { ok: false, error: "RETEXTURE_EXPIRED" };
    }
    if (!row.meshyTaskId) {
      return { ok: false, error: "No source model task to retexture." };
    }
    const guard = await checkBalanceGuard(MESHY_CREDIT_COSTS.retexture);
    if (!guard.ok) return { ok: false, error: guard.error };
    try {
      taskId = await createRetextureTask({
        input_task_id: row.meshyTaskId,
        text_style_prompt: newTexturePrompt || changeNote || undefined,
      });
    } catch (err) {
      console.error("[meshy] requestRevision retexture task creation failed:", err);
      return { ok: false, error: "Could not start retexture. Try again shortly." };
    }
    cost = MESHY_CREDIT_COSTS.retexture;
  } else {
    const guard = await checkBalanceGuard(MESHY_CREDIT_COSTS.generation);
    if (!guard.ok) return { ok: false, error: guard.error };
    try {
      const dataUri = await readSourceImageAsDataUri(row.sourceImagePath);
      taskId = await createImageTo3DTask({
        image_url: dataUri,
        should_texture: true,
        texture_prompt: newTexturePrompt || row.texturePrompt || undefined,
        ai_model: "meshy-6",
        moderation: true,
        target_formats: ["glb", "stl"],
      });
    } catch (err) {
      console.error("[meshy] requestRevision regenerate task creation failed:", err);
      return { ok: false, error: "Could not start regeneration. Try again shortly." };
    }
    cost = MESHY_CREDIT_COSTS.generation;
  }

  // Real COUNT(*) at insert time — never a stored/incremented counter
  // (21-CONTEXT locked).
  const [{ n }] = await db
    .select({ n: count() })
    .from(meshyRevisions)
    .where(eq(meshyRevisions.generationId, id));
  const revisionNumber = n + 1;

  try {
    await db.insert(meshyRevisions).values({
      id: randomUUID(),
      generationId: id,
      revisionNumber,
      endpointUsed: input.mode,
      changeNote: changeNote || null,
      newTexturePrompt: newTexturePrompt || null,
      meshyTaskId: taskId,
      creditsUsed: cost,
    });

    await db
      .update(meshyGenerations)
      .set({
        status: "revising",
        creditsUsed: row.creditsUsed + cost,
        updatedAt: new Date(),
      })
      .where(eq(meshyGenerations.id, id));
  } catch (err) {
    console.error("[meshy] requestRevision insert/update failed:", err);
    return { ok: false, error: "Could not save revision record." };
  }

  revalidatePath(`/admin/meshy/${id}`);
  return { ok: true };
}

// ============================================================================
// approveGeneration
// ============================================================================

export type ApproveGenerationResult = { ok: true } | { ok: false; error: string };

export async function approveGeneration(id: string): Promise<ApproveGenerationResult> {
  const { db, ...session } = await requireAdmin();

  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Generation not found." };
  if (row.status !== "awaiting_review") {
    return { ok: false, error: "Model is not awaiting review." };
  }
  if (!row.meshyTaskId) {
    return { ok: false, error: "No model task to analyze." };
  }

  let analyzeTaskId: string;
  try {
    // Free — always runs on approval (21-CONTEXT locked). Does NOT chain
    // repair, ever — repair only ever fires from the admin's explicit
    // click on repairGeneration below.
    analyzeTaskId = await analyzePrintability({ input_task_id: row.meshyTaskId });
  } catch (err) {
    console.error("[meshy] approveGeneration analyze kickoff failed:", err);
    return { ok: false, error: "Could not start printability analysis. Try again shortly." };
  }

  await db
    .update(meshyGenerations)
    .set({
      status: "analyzing",
      meshyAnalyzeTaskId: analyzeTaskId,
      approvedAt: new Date(),
      approvedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(meshyGenerations.id, id));

  revalidatePath("/admin/meshy");
  revalidatePath(`/admin/meshy/${id}`);
  return { ok: true };
}

// ============================================================================
// repairGeneration — the explicit-click paid action (never auto-fires)
// ============================================================================

export type RepairGenerationResult = { ok: true } | { ok: false; error: string };

export async function repairGeneration(id: string): Promise<RepairGenerationResult> {
  const { db, ...session } = await requireAdmin();

  const limit = rateLimiter.checkRateLimit(`meshy-repair:${session.user.id}`, 10, 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many repair requests; try again in ${Math.ceil(limit.retryAfterMs / 1000)}s.`,
    };
  }

  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Generation not found." };
  if (
    row.status !== "ready" ||
    (row.printabilityStatus !== "warning" && row.printabilityStatus !== "error")
  ) {
    return { ok: false, error: "Repair only applies to a model flagged warning/error." };
  }
  if (!row.meshyTaskId) return { ok: false, error: "No model task to repair." };

  const guard = await checkBalanceGuard(MESHY_CREDIT_COSTS.repair);
  if (!guard.ok) return { ok: false, error: guard.error };

  let repairTaskId: string;
  try {
    repairTaskId = await repairPrintability({ input_task_id: row.meshyTaskId });
  } catch (err) {
    console.error("[meshy] repairGeneration task creation failed:", err);
    return { ok: false, error: "Could not start repair. Try again shortly." };
  }

  await db
    .update(meshyGenerations)
    .set({
      status: "repairing",
      meshyRepairTaskId: repairTaskId,
      creditsUsed: row.creditsUsed + MESHY_CREDIT_COSTS.repair,
      updatedAt: new Date(),
    })
    .where(eq(meshyGenerations.id, id));

  revalidatePath(`/admin/meshy/${id}`);
  return { ok: true };
}

// ============================================================================
// runMulticolor
// ============================================================================

export type RunMulticolorResult = { ok: true } | { ok: false; error: string };

export type RunMulticolorInput = { maxColors: number; maxDepth: number };

export async function runMulticolor(
  id: string,
  input: RunMulticolorInput,
): Promise<RunMulticolorResult> {
  const { db, ...session } = await requireAdmin();

  const limit = rateLimiter.checkRateLimit(`meshy-multicolor:${session.user.id}`, 10, 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many multi-color requests; try again in ${Math.ceil(limit.retryAfterMs / 1000)}s.`,
    };
  }

  if (!Number.isInteger(input.maxColors) || input.maxColors < 1 || input.maxColors > 16) {
    return { ok: false, error: "maxColors must be an integer between 1 and 16." };
  }
  if (!Number.isInteger(input.maxDepth) || input.maxDepth < 3 || input.maxDepth > 6) {
    return { ok: false, error: "maxDepth must be an integer between 3 and 6." };
  }

  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Generation not found." };
  if (row.status !== "ready") return { ok: false, error: "Model is not ready." };
  if (!row.meshyTaskId) return { ok: false, error: "No model task to convert." };

  const guard = await checkBalanceGuard(MESHY_CREDIT_COSTS.multicolor);
  if (!guard.ok) return { ok: false, error: guard.error };

  let taskId: string;
  try {
    taskId = await createMultiColorPrint({
      input_task_id: row.meshyTaskId,
      max_colors: input.maxColors,
      max_depth: input.maxDepth,
    });
  } catch (err) {
    console.error("[meshy] runMulticolor task creation failed:", err);
    return { ok: false, error: "Could not start multi-color conversion. Try again shortly." };
  }

  await db
    .update(meshyGenerations)
    .set({
      status: "processing_multicolor",
      meshyMulticolorTaskId: taskId,
      creditsUsed: row.creditsUsed + MESHY_CREDIT_COSTS.multicolor,
      updatedAt: new Date(),
    })
    .where(eq(meshyGenerations.id, id));

  revalidatePath(`/admin/meshy/${id}`);
  return { ok: true };
}

// ============================================================================
// cancelGeneration — local-only abandon, no Meshy-side cancel call in v1
// ============================================================================

export type CancelGenerationResult = { ok: true } | { ok: false; error: string };

export async function cancelGeneration(id: string): Promise<CancelGenerationResult> {
  const { db } = await requireAdmin();

  const [row] = await db
    .select()
    .from(meshyGenerations)
    .where(eq(meshyGenerations.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Generation not found." };
  if (row.status !== "generating" && row.status !== "awaiting_review") {
    return { ok: false, error: "Only in-progress or awaiting-review generations can be canceled." };
  }

  await db
    .update(meshyGenerations)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(meshyGenerations.id, id));

  revalidatePath("/admin/meshy");
  revalidatePath(`/admin/meshy/${id}`);
  return { ok: true };
}
