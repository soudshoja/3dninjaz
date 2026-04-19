import { getSessionUser } from "@/lib/auth-helpers";
import { CloseAccountForm } from "@/components/account/close-account-form";
import { BUSINESS } from "@/lib/business-info";

/**
 * /account/close — danger-zone closure page (CUST-08). PDPA copy explains
 * every consequence; the form below requires typing "DELETE" before submit
 * is enabled.
 */
export const dynamic = "force-dynamic";

export default async function CloseAccountPage() {
  const user = await getSessionUser();
  if (!user) return null; // layout already redirected

  return (
    <div className="grid gap-4">
      <section
        className="rounded-2xl p-5 md:p-6 bg-white border-2"
        style={{ borderColor: "#DC2626" }}
      >
        <h2
          className="font-[var(--font-heading)] text-xl mb-3"
          style={{ color: "#DC2626" }}
        >
          Danger zone
        </h2>
        <p className="mb-3">
          Closing your account is permanent. Here&apos;s what happens:
        </p>
        <ul className="list-disc pl-6 space-y-1 text-sm mb-4">
          <li>Your name, email, and profile image are anonymized.</li>
          <li>Your saved addresses and wishlist are deleted.</li>
          <li>All your sessions are signed out across every device.</li>
          <li>
            Your orders are <strong>retained for 7 years</strong> to comply
            with Malaysian accounting records (PDPA 2010 Section 10).
            Customer-name snapshots on past orders remain as-is so support
            can respond to receipt or return questions.
          </li>
          <li>
            Reviews you&apos;ve submitted remain visible on product pages but
            attributed to &quot;Former customer&quot;.
          </li>
          <li>
            You can re-register with the same email later. That will create a
            brand-new account with no connection to your previous one.
          </li>
        </ul>
        <p className="text-sm text-slate-700 mb-4">
          If you&apos;d rather contact us first, reach the data-protection
          inbox at{" "}
          <a href={`mailto:${BUSINESS.dpoEmail}`} className="underline">
            {BUSINESS.dpoEmail}
          </a>
          .
        </p>
        <CloseAccountForm />
      </section>
    </div>
  );
}
