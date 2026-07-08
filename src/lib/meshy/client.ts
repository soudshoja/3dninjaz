import "server-only";

/**
 * Phase 21 (21-02) — typed Meshy AI REST client, server-only.
 *
 * Adapted from .claude/skills/meshy-3d-pipeline/scripts/meshy-client.ts with
 * these deltas (21-PATTERNS.md §10):
 *   1. `import "server-only"` added (repo convention for env-reading libs —
 *      MESHY_API_KEY must never reach a client bundle).
 *   2. Added getRetextureTask — the skill script had createRetextureTask but
 *      no matching GET; retexture tasks poll /openapi/v1/retexture/{id}, NOT
 *      the image-to-3d endpoint.
 *   3. The two Text-to-3D creator functions (preview + refine stages) are
 *      removed — out of v1 scope, photo-driven only.
 *   4. The blocking poll-until-done loop is removed — that pattern is
 *      scripts-only; the app must do single-shot GETs per poll tick (client
 *      poll / cron sweep), never hold a request open for minutes.
 *
 * Never import this from a Client Component — it reads MESHY_API_KEY from
 * env. Covers: Image to 3D, Retexture, Analyze/Repair Printability,
 * Multi-Color Print, Balance. Follows the shared task-object pattern
 * documented in .claude/skills/meshy-3d-pipeline/references/api-reference.md.
 */

const MESHY_BASE_URL = "https://api.meshy.ai";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";

export type TaskErrorType =
  | "image_too_complex"
  | "moderation_blocked"
  | "model_missing_uv"
  | "model_insufficient_uv"
  | "format_conversion_failed"
  | "timeout"
  | "service_unavailable"
  | string;

export class MeshyTaskError extends Error {
  constructor(public type: TaskErrorType, message: string) {
    super(message);
    this.name = "MeshyTaskError";
  }

  /** Whether it's safe to automatically retry this failure without human intervention. */
  get isRetryable(): boolean {
    return this.type === "timeout" || this.type === "service_unavailable";
  }
}

export class MeshyHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "MeshyHttpError";
  }
}

function apiKey(): string {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY is not set in the environment");
  return key;
}

/**
 * True when running against the zero-cost dev test-mode key. The pipeline
 * uses this to tolerate fake/unreachable asset URLs on dev (test-mode never
 * produces a real downloadable model — accepted per 21-CONTEXT).
 */
export function isMeshyTestMode(): boolean {
  return (process.env.MESHY_API_KEY ?? "").startsWith("msy_dummy");
}

async function meshyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MESHY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MeshyHttpError(res.status, `Meshy API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ---------- Image to 3D ----------

export interface ImageTo3DParams {
  image_url: string;
  ai_model?: "meshy-6" | "meshy-5" | "latest";
  should_texture?: boolean;
  texture_prompt?: string; // max 600 chars — validate before calling
  texture_image_url?: string;
  enable_pbr?: boolean;
  should_remesh?: boolean;
  topology?: "quad" | "triangle";
  target_polycount?: number;
  symmetry_mode?: "off" | "auto" | "on";
  model_type?: string;
  image_enhancement?: boolean;
  moderation?: boolean;
  auto_size?: boolean;
  origin_at?: string;
  target_formats?: Array<"glb" | "fbx" | "obj" | "usdz" | "stl" | "3mf">;
}

export interface ModelUrls {
  glb?: string;
  fbx?: string;
  obj?: string;
  usdz?: string;
  stl?: string;
  "3mf"?: string;
  pre_remeshed_glb?: string;
}

export interface GenerationTaskResult {
  id: string;
  type: string;
  status: TaskStatus;
  progress?: number;
  model_urls?: ModelUrls;
  thumbnail_url?: string;
  thumbnail_urls?: Record<string, string>;
  alpha_thumbnail_url?: string;
  task_error?: { type: TaskErrorType; message: string };
}

/** Validate the 600-char cap before ever hitting the network — cheap fail fast. */
export function assertTexturePromptLength(prompt: string | undefined) {
  if (prompt && prompt.length > 600) {
    throw new Error(`texture_prompt is ${prompt.length} chars, max is 600`);
  }
}

export async function createImageTo3DTask(params: ImageTo3DParams): Promise<string> {
  assertTexturePromptLength(params.texture_prompt);
  const result = await meshyFetch<{ result: string }>("/openapi/v1/image-to-3d", {
    method: "POST",
    body: JSON.stringify({ moderation: true, ...params }),
  });
  return result.result;
}

export async function getImageTo3DTask(taskId: string): Promise<GenerationTaskResult> {
  return meshyFetch<GenerationTaskResult>(`/openapi/v1/image-to-3d/${taskId}`);
}

// ---------- Retexture (cheap "same shape, new look" revision) ----------

export async function createRetextureTask(params: {
  input_task_id: string;
  text_style_prompt?: string;
  image_style_url?: string;
  ai_model?: string;
}): Promise<string> {
  assertTexturePromptLength(params.text_style_prompt);
  const result = await meshyFetch<{ result: string }>("/openapi/v1/retexture", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.result;
}

/** Poll this -- NOT getImageTo3DTask -- to check a retexture task. Different endpoint, own response shape. */
export async function getRetextureTask(taskId: string): Promise<GenerationTaskResult> {
  return meshyFetch<GenerationTaskResult>(`/openapi/v1/retexture/${taskId}`);
}

// ---------- Printing ----------

export interface PrintabilityResult {
  status: "healthy" | "warning" | "error" | "unknown";
  is_watertight: boolean;
  volume?: number;
  non_manifold_edge_count?: number;
  degenerate_face_count?: number;
  hole_count?: number;
}

/** Free — no credits consumed. Always call before repair or before releasing a model for print. */
export async function analyzePrintability(params: {
  model_url?: string;
  input_task_id?: string;
}): Promise<string> {
  const result = await meshyFetch<{ result: string }>("/openapi/v1/print/analyze", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.result;
}

export async function getPrintabilityAnalysis(taskId: string): Promise<GenerationTaskResult & PrintabilityResult> {
  return meshyFetch(`/openapi/v1/print/analyze/${taskId}`);
}

/** 10 credits. Output format mirrors the input format. */
export async function repairPrintability(params: {
  model_url?: string;
  input_task_id?: string;
}): Promise<string> {
  const result = await meshyFetch<{ result: string }>("/openapi/v1/print/repair", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.result;
}

/** Poll this -- NOT getImageTo3DTask -- to check a repair task. Different endpoint, own response shape. */
export async function getRepairTask(taskId: string): Promise<GenerationTaskResult> {
  return meshyFetch<GenerationTaskResult>(`/openapi/v1/print/repair/${taskId}`);
}

/** 10 credits. Output is 3MF only. max_colors 1-16, max_depth 3-6. */
export async function createMultiColorPrint(params: {
  input_task_id?: string;
  model_url?: string;
  max_colors: number;
  max_depth?: number;
}): Promise<string> {
  const result = await meshyFetch<{ result: string }>("/openapi/v1/print/multi-color", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.result;
}

/** Poll this -- NOT getImageTo3DTask -- to check a multi-color task. Different endpoint, own response shape. */
export async function getMultiColorTask(taskId: string): Promise<GenerationTaskResult> {
  return meshyFetch<GenerationTaskResult>(`/openapi/v1/print/multi-color/${taskId}`);
}

// ---------- Account ----------

export async function getBalance(): Promise<{ balance: number }> {
  return meshyFetch("/openapi/v1/balance");
}
