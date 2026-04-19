import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { CheckoutIsland } from "@/components/checkout/paypal-provider";
import { BRAND } from "@/lib/brand";

/**
 * /checkout — server component auth gate + layout shell (D3-03, D3-04, T-03-16).
 *
 * - Unauthenticated visitors are redirected to /login?next=/checkout before
 *   any client code runs (PROJECT.md "Account required for purchases").
 * - The bag-empty gate runs on the client island (Zustand + localStorage)
 *   after hydration; see paypal-provider.tsx.
 * - `force-dynamic` because we read the session cookie — never cache the
 *   rendered page for a specific user.
 */

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?next=/checkout");
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-14">
        <header className="mb-6 md:mb-10">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-5xl">
            Checkout
          </h1>
          <p className="mt-2 text-slate-700">
            Enter your shipping details and complete payment with PayPal.
          </p>
        </header>
        <CheckoutIsland
          defaultName={user.name ?? ""}
          defaultEmail={user.email}
        />
      </div>
    </main>
  );
}
