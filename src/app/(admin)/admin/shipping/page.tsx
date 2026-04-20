import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listShippingRates } from "@/actions/admin-shipping";
import { getStoreSettingsCached } from "@/lib/store-settings";
import { BRAND } from "@/lib/brand";
import { ShippingRatesForm } from "@/components/admin/shipping-rates-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Shipping",
  robots: { index: false, follow: false },
};

export default async function AdminShippingPage() {
  await requireAdmin();
  const [rates, settings] = await Promise.all([
    listShippingRates(),
    getStoreSettingsCached(),
  ]);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Shipping rates
          </h1>
          <p className="mt-1 text-slate-600">
            Set per-state flat rates for Malaysia. Free-shipping kicks in at
            the threshold below.
          </p>
          <p className="mt-3 text-sm">
            <Link
              href="/admin/shipping/delyva"
              className="inline-flex items-center gap-1 rounded-full px-4 py-2 font-semibold text-white"
              style={{ backgroundColor: BRAND.blue }}
            >
              Delyva courier integration &rarr;
            </Link>
          </p>
        </header>
        <ShippingRatesForm
          rates={rates}
          initialFreeShipThreshold={settings.freeShipThreshold ?? null}
          settingsSnapshot={{
            businessName: settings.businessName,
            contactEmail: settings.contactEmail,
            whatsappNumber: settings.whatsappNumber,
            whatsappNumberDisplay: settings.whatsappNumberDisplay,
            instagramUrl: settings.instagramUrl,
            tiktokUrl: settings.tiktokUrl,
            bannerText: settings.bannerText ?? null,
            bannerEnabled: !!settings.bannerEnabled,
            sstEnabled: !!settings.sstEnabled,
            sstRate: settings.sstRate,
          }}
        />
      </div>
    </main>
  );
}
