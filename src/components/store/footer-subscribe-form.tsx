"use client";

import { useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/brand";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; already: boolean; reactivated: boolean }
  | { kind: "error"; message: string };

/**
 * Footer newsletter signup — posts to /api/subscribe with `source: 'footer'`.
 *
 * Minimal UI: email input + button. Success state swaps the form for a
 * thank-you badge; duplicate subscription surfaces a friendly "already
 * subscribed!" message instead of a raw error.
 *
 * Keeps everything self-contained so <SiteFooter> (server component) can
 * drop it in without lifting state.
 */
export function FooterSubscribeForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === "submitting") return;

    const trimmed = email.trim();
    if (!trimmed) {
      setState({ kind: "error", message: "Please enter your email." });
      return;
    }

    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "footer" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setState({
          kind: "error",
          message:
            typeof data?.error === "string"
              ? data.error
              : "Something went wrong. Please try again.",
        });
        return;
      }
      setState({
        kind: "success",
        already: Boolean(data?.already),
        reactivated: Boolean(data?.reactivated),
      });
    } catch {
      setState({
        kind: "error",
        message: "Network error — please try again.",
      });
    }
  }

  if (state.kind === "success") {
    const msg = state.already
      ? "You're already on the list. Stay stealthy!"
      : state.reactivated
        ? "Welcome back! You're subscribed again."
        : "Thanks! We'll send ninja news.";
    return (
      <div
        className="inline-flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ backgroundColor: "#ffffff" }}
        role="status"
        aria-live="polite"
      >
        <Image
          src="/icons/ninja/emoji/thank-you@128.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 object-contain"
        />
        <span className="text-sm font-semibold" style={{ color: BRAND.ink }}>
          {msg}
        </span>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col sm:flex-row gap-2 w-full max-w-md"
      aria-label="Newsletter signup"
      noValidate
    >
      <label htmlFor="footer-subscribe-email" className="sr-only">
        Email address
      </label>
      <input
        id="footer-subscribe-email"
        type="email"
        required
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state.kind === "error") setState({ kind: "idle" });
        }}
        disabled={state.kind === "submitting"}
        className="flex-1 min-h-[48px] rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-offset-0"
        style={{ borderColor: "#d4d4d8" }}
      />
      <button
        type="submit"
        disabled={state.kind === "submitting"}
        className="inline-flex items-center justify-center min-h-[48px] rounded-xl px-5 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-70"
        style={{ backgroundColor: BRAND.blue }}
      >
        {state.kind === "submitting" ? "Subscribing…" : "Subscribe"}
      </button>
      {state.kind === "error" ? (
        <p
          className="text-xs font-semibold w-full"
          style={{ color: "#b91c1c" }}
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
