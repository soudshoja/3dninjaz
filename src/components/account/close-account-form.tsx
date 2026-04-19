"use client";

import { useState, useTransition } from "react";
import { closeMyAccount } from "@/actions/account-close";
import { BRAND } from "@/lib/brand";

/**
 * Danger-zone close-account form. Requires typing the literal string
 * "DELETE" in the confirm input before the submit button is enabled
 * (T-06-07-consent). On successful submit the server action redirects to
 * "/?closed=1" — the client never returns here.
 */
export function CloseAccountForm() {
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const canSubmit = confirm === "DELETE" && !pending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      // If closeMyAccount succeeds it redirects and never returns.
      const res = await closeMyAccount({ confirmText: confirm }).catch(
        (error: unknown) => {
          // `redirect()` throws a NEXT_REDIRECT error intentionally; let
          // Next.js propagate that upward by re-throwing.
          throw error;
        },
      );
      if (res && !res.ok) setErr(res.error);
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <label className="grid gap-2">
        <span className="text-sm font-bold">
          Type <strong>DELETE</strong> to confirm
        </span>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="min-h-[48px] px-3 rounded-lg border-2 bg-white"
          style={{ borderColor: "rgba(0,0,0,0.15)" }}
          autoComplete="off"
          aria-describedby="close-help"
          required
        />
        <span id="close-help" className="text-sm text-slate-600">
          This is case-sensitive. Typing DELETE will close your account
          immediately.
        </span>
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center justify-center min-h-[60px] px-5 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: "#DC2626", color: "#ffffff" }}
      >
        {pending ? "Closing…" : "Close my account permanently"}
      </button>
      {err ? (
        <p role="alert" className="text-sm" style={{ color: "#DC2626" }}>
          {err}
        </p>
      ) : null}
    </form>
  );
}
