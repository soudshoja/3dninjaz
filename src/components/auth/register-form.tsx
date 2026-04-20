"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
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

    // Client-side validation (server re-validates independently).
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
      // pdpaConsentAt is a server-side ISO timestamp set at submission time,
      // NOT a client boolean. Better Auth persists it on the user record.
      const result = await authClient.signUp.email({
        email,
        password,
        name,
        // additionalFields
        pdpaConsentAt: new Date().toISOString(),
      } as Parameters<typeof authClient.signUp.email>[0]);

      if (result.error) {
        setError(result.error.message ?? "Unable to create account.");
        return;
      }

      // New registrations always land on customer role (D-08). Drop them
      // into their account dashboard so they can see orders / addresses
      // immediately rather than the anonymous storefront.
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
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-2xl text-[var(--color-brand-text-primary)]">
          Create Account
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          Join 3D Ninjaz to buy unique 3D printed products
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="h-10"
          />
        </div>

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
          <Label htmlFor="password">Password</Label>
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
          className="h-10 w-full bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
        >
          {submitting ? "Creating account..." : "Create Account"}
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-brand-text-muted)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--color-brand-primary)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
