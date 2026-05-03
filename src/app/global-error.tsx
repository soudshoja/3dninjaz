"use client";

import { useEffect, useState } from "react";
import { reportClientError } from "@/actions/client-error-reporter";

/**
 * Phase 7 (07-09) — root-layout error fallback.
 *
 * Wraps <html><body> because the root layout itself failed; cannot depend
 * on anything provided by layout.tsx. Inline minimal styles.
 *
 * Same contract as error.tsx: NEVER renders error.message/stack to the
 * client (T-07-09-error-page-leak).
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
  useEffect(() => {
    void reportClientError({
      requestId,
      message: error.message,
      stack: error.stack,
      context: { digest: error.digest, scope: "global-error" },
    }).catch(() => {});
  }, [requestId, error]);

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
            onClick={reset}
            style={{
              minHeight: "48px",
              padding: "0.75rem 1.25rem",
              backgroundColor: "#1E8BFF",
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
