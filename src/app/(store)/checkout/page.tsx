import { getSessionUser } from "@/lib/auth-helpers";
import { listMyAddresses } from "@/actions/addresses";
import { CheckoutIsland } from "@/components/checkout/paypal-provider";
import { BRAND } from "@/lib/brand";
import { getStoreSettingsCached } from "@/lib/store-settings";

/**
 * /checkout — server component layout shell (D3-03, D3-04, T-03-16).
 *
 * - Guests (unauthenticated) may proceed through checkout without an account.
 *   The CheckoutIsland renders a guest details form (name required, email
 *   optional). Both PayPal and WhatsApp bank transfer work for guests.
 * - Authenticated users see the same flow as before, with saved addresses.
 * - The bag-empty gate runs on the client island (Zustand + localStorage)
 *   after hydration; see paypal-provider.tsx.
 * - `force-dynamic` because we read the session cookie — never cache the
 *   rendered page for a specific user.
 */

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await getSessionUser();
  const isGuest = !user;

  // Phase 6 06-03 — fetch saved addresses for logged-in users only (guests
  // have none); store settings supply the WhatsApp number + bank details.
  const [savedAddresses, settings] = await Promise.all([
    user ? listMyAddresses() : Promise.resolve([]),
    getStoreSettingsCached(),
  ]);

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
            {user
              ? "Enter your shipping details and complete payment."
              : "Enter your details below and pay with PayPal or WhatsApp bank transfer."}
          </p>
        </header>
        <CheckoutIsland
          defaultName={user?.name ?? ""}
          defaultEmail={user?.email ?? ""}
          savedAddresses={savedAddresses}
          userId={user?.id ?? null}
          isGuest={isGuest}
          whatsappNumber={settings.whatsappNumber ?? "60167203048"}
          bankName={settings.bankName}
          bankAccountNumber={settings.bankAccountNumber}
          bankAccountHolder={settings.bankAccountHolder}
        />
      </div>
    </main>
  );
}
