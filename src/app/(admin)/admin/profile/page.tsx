import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { AdminProfileForm } from "@/components/admin/admin-profile-form";
import { AdminChangePasswordForm } from "@/components/admin/admin-change-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Profile",
  robots: { index: false, follow: false },
};

/**
 * /admin/profile — admin self-service for display name + password change.
 *
 * Email change is intentionally OUT of scope for v1: the customer-side flow
 * (Phase 6 06-02) requires the email-verification round trip and we don't
 * want to add a route just for the admin user. Defer to a Phase 7 task.
 *
 * requireAdmin() at the top is belt-and-braces — the (admin)/layout.tsx
 * already redirects unauthenticated users, but per CVE-2025-29927 every
 * admin surface re-verifies at the handler layer.
 */
export default async function AdminProfilePage() {
  const session = await requireAdmin();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Profile
          </h1>
          <p className="mt-1 text-slate-600">
            Update your display name or change your password.
          </p>
        </header>

        <section
          aria-labelledby="account"
          className="rounded-2xl p-5 md:p-6 mb-4"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2
            id="account"
            className="font-[var(--font-heading)] text-xl mb-1"
          >
            Account
          </h2>
          <dl className="grid gap-1 text-sm mb-4">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Email</dt>
              <dd className="break-words">{session.user.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Role</dt>
              <dd className="font-semibold">{(session.user as unknown as { role: string }).role}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500 mb-4">
            Email changes for admin accounts are not yet supported in this UI.
            Open a database ticket if your email needs to be updated.
          </p>
          <AdminProfileForm
            initialName={session.user.name ?? ""}
          />
        </section>

        <section
          aria-labelledby="password"
          className="rounded-2xl p-5 md:p-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2
            id="password"
            className="font-[var(--font-heading)] text-xl mb-3"
          >
            Change password
          </h2>
          <AdminChangePasswordForm />
        </section>
      </div>
    </main>
  );
}
