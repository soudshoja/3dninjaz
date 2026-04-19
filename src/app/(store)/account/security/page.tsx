import { getSessionUser } from "@/lib/auth-helpers";
import { ChangeEmailForm } from "@/components/account/change-email-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { BRAND } from "@/lib/brand";

/**
 * /account/security — change email + change password (CUST-02). Heavy
 * lifting lives in the client forms; this server component renders the
 * shell + a "?verified=1" success banner after the email-change link in
 * the new inbox is clicked.
 */
export const dynamic = "force-dynamic";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) return null; // layout already redirected

  const { verified } = await searchParams;

  return (
    <div>
      {verified === "1" ? (
        <div
          role="status"
          className="rounded-2xl p-4 mb-4"
          style={{
            backgroundColor: `${BRAND.green}30`,
            color: BRAND.ink,
          }}
        >
          Email verified. Your account email is now updated.
        </div>
      ) : null}

      <section className="rounded-2xl p-5 md:p-6 mb-4 bg-white">
        <h2 className="font-[var(--font-heading)] text-xl mb-3">
          Change email
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          We&apos;ll send a verification link to the new address. Click the
          link to complete the change.
        </p>
        <ChangeEmailForm currentEmail={user.email} />
      </section>

      <section className="rounded-2xl p-5 md:p-6 mb-4 bg-white">
        <h2 className="font-[var(--font-heading)] text-xl mb-3">
          Change password
        </h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
