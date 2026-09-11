"use client";

import { useEffect, useState } from "react";
import { BrandedFiveHundred } from "@/components/error/branded-500";
import { reportClientError } from "@/actions/client-error-reporter";
import {
  consumeAutoRecoveryAttempt,
  hardRecover,
  isStaleBundleError,
} from "@/lib/is-stale-bundle-error";

/**
 * Phase 7 (07-09) — root error boundary.
 *
 * Generates a client-side requestId for support correlation, ships error
 * details to the server log via reportClientError server action, and
 * renders BrandedFiveHundred. The component receives ONLY { requestId,
 * reset } — error.message / error.stack are NEVER passed to the rendered
 * tree (T-07-09-error-page-leak).
 *
 * Quick task 260911-skew-checkout-selfheal: when `error` matches a known
 * stale-bundle / deployment-skew signature, `reset()` cannot recover
 * because it re-renders against the SAME stale bundle. Instead this
 * boundary self-heals with a single cache-busted hard navigation
 * (see src/lib/is-stale-bundle-error.ts). At most one auto-recovery
 * attempt happens per browsing session; after that, "Try again" still
 * performs the hard navigation manually rather than falling back to the
 * dead-end reset().
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
  // Lazy initialisers so a re-render can never re-derive `recoverable` off a
  // new error instance or consume a second session attempt.
  const [recoverable] = useState(() => isStaleBundleError(error));
  const [mayAutoRecover] = useState(() =>
    recoverable ? consumeAutoRecoveryAttempt() : false,
  );

  useEffect(() => {
    const autoRecover = recoverable && mayAutoRecover;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const reportPromise = reportClientError({
      requestId,
      message: error.message,
      stack: error.stack,
      context: { digest: error.digest, staleBundle: recoverable, autoRecover },
    }).catch(() => {});

    if (!autoRecover) {
      return;
    }

    // D-03: await the report (raced against a ~1000ms timeout) before
    // navigating away — location.replace() aborts in-flight requests, and
    // firing the report + navigating in the same tick would silently drop
    // the telemetry for exactly the errors we most want to count.
    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 1000);
    });

    void Promise.race([reportPromise, timeoutPromise]).then(() => {
      hardRecover();
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [requestId, error, recoverable, mayAutoRecover]);

  return (
    <BrandedFiveHundred
      requestId={requestId}
      reset={recoverable ? hardRecover : reset}
    />
  );
}
