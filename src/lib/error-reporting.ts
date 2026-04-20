import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Phase 7 (07-09) — error reporting helpers.
 *
 * generateRequestId(): 8-char UUID slice for support correlation.
 * logError(params): structured server-side console.error. NEVER returns the
 * stack/message to the client (T-07-X-error-page-leak / D-07-12).
 */

export function generateRequestId(): string {
  return randomUUID().slice(0, 8);
}

export function logError(params: {
  requestId: string;
  message?: string;
  stack?: string;
  context?: Record<string, unknown>;
}): void {
  const { requestId, message, stack, context } = params;
  console.error("[error-page]", {
    requestId,
    message,
    stack,
    context,
    at: new Date().toISOString(),
  });
}
