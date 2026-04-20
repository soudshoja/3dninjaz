"use client";

import { useEffect, useState } from "react";
import { BrandedFiveHundred } from "@/components/error/branded-500";
import { reportClientError } from "@/actions/client-error-reporter";

/**
 * Phase 7 (07-09) — root error boundary.
 *
 * Generates a client-side requestId for support correlation, ships error
 * details to the server log via reportClientError server action, and
 * renders BrandedFiveHundred. The component receives ONLY { requestId,
 * reset } — error.message / error.stack are NEVER passed to the rendered
 * tree (T-07-09-error-page-leak).
 */
function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [requestId] = useState(() => makeId());
  useEffect(() => {
    void reportClientError({
      requestId,
      message: error.message,
      stack: error.stack,
      context: { digest: error.digest },
    }).catch(() => {});
  }, [requestId, error]);

  return <BrandedFiveHundred requestId={requestId} reset={reset} />;
}
