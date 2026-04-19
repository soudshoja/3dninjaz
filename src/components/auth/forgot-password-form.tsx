"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GENERIC_MESSAGE =
  "If an account with that email exists, we've sent a password reset link.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Do not leak whether the email exists (T-02-02).
      await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
    } catch (err) {
      // Swallow errors intentionally to avoid email enumeration.
      console.error("[forgot-password] swallow:", err);
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-2xl text-[var(--color-brand-text-primary)]">
          Forgot Password
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      {submitted ? (
        <div className="space-y-4">
          <p
            className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
            role="status"
          >
            {GENERIC_MESSAGE}
          </p>
          <p className="text-center text-sm">
            <Link
              href="/login"
              className="font-medium text-[var(--color-brand-primary)] hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="h-10"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="h-10 w-full bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
          >
            {submitting ? "Sending..." : "Send reset link"}
          </Button>

          <p className="text-center text-sm text-[var(--color-brand-text-muted)]">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--color-brand-primary)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
