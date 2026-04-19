"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Invalid email or password.");
        return;
      }

      // Role-based redirect (D-07). Better Auth returns user on the result.
      // Fetch current session to read role since signIn result shape may vary.
      const session = await authClient.getSession();
      const role =
        session.data?.user && "role" in session.data.user
          ? (session.data.user as { role?: string }).role
          : undefined;

      if (role === "admin") {
        router.push("/admin");
      } else {
        router.push("/");
      }
      router.refresh();
    } catch (err) {
      console.error("[login] unexpected error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-2xl text-[var(--color-brand-text-primary)]">
          Sign In
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          Welcome back to 3D Ninjaz
        </p>
      </div>

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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-[var(--color-brand-primary)] hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
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
          disabled={submitting}
          className="h-10 w-full bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
        >
          {submitting ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-brand-text-muted)]">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-[var(--color-brand-primary)] hover:underline"
        >
          Register
        </Link>
      </p>
    </div>
  );
}
