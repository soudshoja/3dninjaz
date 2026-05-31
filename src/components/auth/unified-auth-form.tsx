"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── types ────────────────────────────────────────────────────────────────────

export type AuthMode = "login" | "register" | "forgot";

interface Props {
  defaultMode?: AuthMode;
}

// ─── helpers (login) ──────────────────────────────────────────────────────────

function isSafeNext(next: string | null): next is string {
  if (!next) return false;
  return next.startsWith("/") && !next.startsWith("//");
}

function destinationFor(role: string | undefined, next: string | null): string {
  const safeNext = isSafeNext(next) ? next : null;
  if (role === "admin") return safeNext ?? "/admin";
  if (safeNext && !safeNext.startsWith("/admin")) return safeNext;
  return "/account";
}

// ─── forgot-password sub-form ─────────────────────────────────────────────────

const GENERIC_MESSAGE =
  "If an account with that email exists, we've sent a password reset link.";

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
    } catch (err) {
      console.error("[forgot-password] swallow:", err);
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="space-y-6">
      {/* back link — replaces tab bar in forgot mode */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-[var(--color-brand-primary)] hover:underline"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to Sign In
      </button>

      <div className="space-y-2 text-center">
        <h2 className="font-heading text-2xl text-[var(--color-brand-text-primary)]">
          Forgot Password
        </h2>
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
            <button
              type="button"
              onClick={onBack}
              className="font-medium text-[var(--color-brand-primary)] hover:underline"
            >
              Back to sign in
            </button>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="h-12"
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
          >
            {submitting ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}
    </div>
  );
}

// ─── login sub-form ───────────────────────────────────────────────────────────

function LoginForm({
  onForgot,
}: {
  onForgot: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Invalid email or password.");
        return;
      }
      const session = await authClient.getSession();
      const role =
        session.data?.user && "role" in session.data.user
          ? (session.data.user as { role?: string }).role
          : undefined;
      router.push(destinationFor(role, next));
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
      {/* ninja emoji header */}
      <div className="flex justify-center">
        <Image
          src="/icons/ninja/emoji/hello.png"
          alt=""
          width={100}
          height={100}
          priority
          className="h-[100px] w-[100px] object-contain"
        />
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="h-12"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <button
              type="button"
              onClick={onForgot}
              className="text-xs text-[var(--color-brand-primary)] hover:underline"
            >
              Forgot your password?
            </button>
          </div>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="h-12"
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
          className="h-12 w-full bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
        >
          {submitting ? "Signing in..." : "Sign In"}
        </Button>

        <p className="flex items-center justify-center gap-2 text-xs text-[var(--color-brand-text-muted)]">
          <Image
            src="/icons/ninja/emoji/secure@128.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span>Secure sign-in — we never see your password.</span>
        </p>
      </form>
    </div>
  );
}

// ─── register sub-form ────────────────────────────────────────────────────────

function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pdpaChecked, setPdpaChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!pdpaChecked) {
      setError("You must agree to the PDPA Privacy Policy to register.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name,
        pdpaConsentAt: new Date().toISOString(),
      } as Parameters<typeof authClient.signUp.email>[0]);

      if (result.error) {
        setError(result.error.message ?? "Unable to create account.");
        return;
      }

      // Welcome email is sent server-side by a Better Auth
      // databaseHooks.user.create.after hook (src/lib/auth.ts) — the
      // client redirect below used to cancel the SMTP send mid-flight.

      router.push("/account");
      router.refresh();
    } catch (err) {
      console.error("[register] unexpected error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-2" noValidate>
      <div className="space-y-2">
        <Label htmlFor="reg-name">Name</Label>
        <Input
          id="reg-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="h-12"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reg-email">Email</Label>
        <Input
          id="reg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="h-12"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reg-password">Password</Label>
        <Input
          id="reg-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="h-12"
        />
        <p className="text-xs text-[var(--color-brand-text-muted)]">
          Minimum 8 characters.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reg-confirm-password">Confirm Password</Label>
        <Input
          id="reg-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="h-12"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-[var(--color-brand-text-primary)]">
        <input
          type="checkbox"
          checked={pdpaChecked}
          onChange={(e) => setPdpaChecked(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-[var(--color-brand-primary)] focus:ring-[var(--color-brand-primary)]"
          required
        />
        <span>
          I agree to the{" "}
          <Link
            href="/privacy"
            className="text-[var(--color-brand-primary)] underline"
          >
            Privacy Policy
          </Link>{" "}
          and consent to data processing under PDPA 2010.
        </span>
      </label>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="h-12 w-full bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
      >
        {submitting ? "Creating account..." : "Create Account"}
      </Button>
    </form>
  );
}

// ─── tab bar ──────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
}: {
  active: "login" | "register";
  onChange: (mode: "login" | "register") => void;
}) {
  return (
    <div className="flex border-b border-zinc-200" role="tablist">
      {(["login", "register"] as const).map((tab) => {
        const isActive = active === tab;
        const label = tab === "login" ? "Sign In" : "Register";
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={[
              "flex-1 min-h-[44px] flex items-center justify-center pb-3 pt-1 text-sm font-medium transition-colors",
              isActive
                ? "border-b-2 border-[#1E8BFF] text-[#1E8BFF]"
                : "text-[var(--color-brand-text-muted)] hover:text-[var(--color-brand-text-primary)]",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── unified form (exported) ──────────────────────────────────────────────────

export function UnifiedAuthForm({ defaultMode = "login" }: Props) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);

  // When switching tabs, only toggle between login/register (not forgot).
  function handleTabChange(tab: "login" | "register") {
    setMode(tab);
  }

  return (
    <div className="space-y-6">
      {/* tab bar — hidden in forgot mode */}
      {mode !== "forgot" && (
        <TabBar
          active={mode as "login" | "register"}
          onChange={handleTabChange}
        />
      )}

      {/* form body */}
      {mode === "login" && (
        <LoginForm onForgot={() => setMode("forgot")} />
      )}
      {mode === "register" && <RegisterForm />}
      {mode === "forgot" && (
        <ForgotForm onBack={() => setMode("login")} />
      )}
    </div>
  );
}
