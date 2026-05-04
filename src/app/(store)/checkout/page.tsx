import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { listMyAddresses } from "@/actions/addresses";
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

  // Phase 6 06-03 — fetch saved addresses for the AddressPicker. Server-side
  // listMyAddresses re-validates session via requireUser(), but we already
  // know the user is authenticated (gate above). Returns [] if none saved —
  // the picker hides itself and the existing form path is preserved.
  const savedAddresses = await listMyAddresses();

  return (
    <main
      className="min-h-screen bg-white"
      style={{ color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-14">
        <header className="mb-6 md:mb-10">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-5xl text-zinc-900">
            Checkout
          </h1>
          <p className="mt-2 text-zinc-600">
            Enter your shipping details and complete payment with PayPal.
          </p>
        </header>
        <CheckoutIsland
          defaultName={user.name ?? ""}
          defaultEmail={user.email}
          savedAddresses={savedAddresses}
          userId={user.id}
        />
      </div>
    </main>
  );
}
