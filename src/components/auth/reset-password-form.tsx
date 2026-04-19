"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing or invalid reset token. Please request a new reset link.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (result.error) {
        setError(
          result.error.message ??
            "Token expired or invalid. Please request a new reset link."
        );
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      console.error("[reset-password] unexpected error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-2xl text-[var(--color-brand-text-primary)]">
          Reset Password
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          Choose a new password for your account.
        </p>
      </div>

      {success ? (
        <div className="space-y-4">
          <p
            className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
            role="status"
          >
            Password reset successfully. Redirecting to sign in...
          </p>
          <p className="text-center text-sm">
            <Link
              href="/login"
              className="font-medium text-[var(--color-brand-primary)] hover:underline"
            >
              Go to sign in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="h-10"
            />
            <p className="text-xs text-[var(--color-brand-text-muted)]">
              Minimum 8 characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="h-10"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting || !token}
            className="h-10 w-full bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
          >
            {submitting ? "Resetting..." : "Reset Password"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function ResetPasswordForm() {
  // useSearchParams requires a Suspense boundary during static rendering.
  return (
    <Suspense
      fallback={
        <p className="text-center text-sm text-[var(--color-brand-text-muted)]">
          Loading...
        </p>
      }
    >
      <ResetPasswordFormInner />
    </Suspense>
  );
}
