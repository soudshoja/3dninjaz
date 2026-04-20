"use server";

import { logError } from "@/lib/error-reporting";

/**
 * Phase 7 (07-09) — server action wrapper around logError so the
 * client-side error.tsx boundary can ship error details to the server log
 * for support correlation. NEVER returns anything sensitive to the client
 * (returns void).
 */
export async function reportClientError(params: {
  requestId: string;
  message?: string;
  stack?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  logError(params);
}
