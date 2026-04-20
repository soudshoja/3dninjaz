"use client";

import { useState, useTransition } from "react";
import {
  adminReactivate,
  adminUnsubscribe,
} from "@/actions/admin-subscribers";

type Props = {
  id: string;
  status: "active" | "unsubscribed" | "bounced";
};

/**
 * Per-row admin actions for /admin/subscribers. Active rows can be
 * "Unsubscribed" (confirm prompt); unsubscribed rows can be "Reactivated".
 * Bounced rows are read-only — admin should dig into SMTP logs, not override.
 */
export function SubscriberRowActions({ id, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "bounced") {
    return <span className="text-xs text-zinc-400">—</span>;
  }

  async function onUnsubscribe() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Unsubscribe this email? They won't get future emails.")
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await adminUnsubscribe(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  async function onReactivate() {
    setError(null);
    startTransition(async () => {
      try {
        await adminReactivate(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {status === "active" ? (
        <button
          type="button"
          onClick={onUnsubscribe}
          disabled={isPending}
          className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
        >
          {isPending ? "Working…" : "Unsubscribe"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onReactivate}
          disabled={isPending}
          className="text-xs font-semibold text-green-700 hover:text-green-900 disabled:opacity-50"
        >
          {isPending ? "Working…" : "Reactivate"}
        </button>
      )}
      {error ? (
        <span className="text-[10px] text-red-600">{error}</span>
      ) : null}
    </div>
  );
}
