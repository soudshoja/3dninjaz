"use client";

import { useEffect, useState } from "react";
import { reportClientError } from "@/actions/client-error-reporter";
import {
  consumeAutoRecoveryAttempt,
  hardRecover,
  isStaleBundleError,
} from "@/lib/is-stale-bundle-error";

/**
 * Phase 7 (07-09) — root-layout error fallback.
 *
 * Wraps <html><body> because the root layout itself failed; cannot depend
 * on anything provided by layout.tsx. Inline minimal styles.
 *
 * Same contract as error.tsx: NEVER renders error.message/stack to the
 * client (T-07-09-error-page-leak).
 *
 * Quick task 260911-skew-checkout-selfheal: this is the boundary scope
 * ('global-error') that production logs actually recorded for the
 * stale-bundle incident, so it gets the identical self-heal logic as
 * src/app/error.tsx — see src/lib/is-stale-bundle-error.ts for the
 * detection/recovery contract.
 */
function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [requestId] = useState(() => makeId());
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
      context: {
        digest: error.digest,
        scope: "global-error",
        staleBundle: recoverable,
        autoRecover,
      },
    }).catch(() => {});

    if (!autoRecover) {
      return;
    }

    // D-03: await the report (raced against a ~1000ms timeout) before
    // navigating — location.replace() aborts in-flight requests.
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
    <html>
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#F7FAF4",
          color: "#0B1020",
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              marginBottom: "0.75rem",
            }}
          >
            Something went very wrong
          </h1>
          <p style={{ color: "#475569", marginBottom: "0.5rem" }}>
            The ninja stumbled on the layout. Please try again, or contact
            support and quote the reference below.
          </p>
          <p
            style={{
              fontFamily: "monospace",
              color: "#475569",
              marginBottom: "1.5rem",
            }}
          >
            Reference: <strong>{requestId}</strong>
          </p>
          <button
            type="button"
            onClick={recoverable ? hardRecover : reset}
            style={{
              minHeight: "48px",
              padding: "0.75rem 1.25rem",
              backgroundColor: "#1877F2",
              color: "#ffffff",
              fontWeight: 600,
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
