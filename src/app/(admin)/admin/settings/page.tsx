import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { getStoreSettings } from "@/actions/admin-settings";
import { BRAND } from "@/lib/brand";
import { SettingsForm } from "@/components/admin/settings-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Settings",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getStoreSettings();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Store settings
          </h1>
          <p className="mt-1 text-slate-600">
            Edit business name, contact info, social links, banner, SST and
            free-ship threshold. Changes propagate within ~60 seconds (cached
            for performance).
          </p>
        </header>
        <SettingsForm
          initial={{
            businessName: settings.businessName,
            contactEmail: settings.contactEmail,
            whatsappNumber: settings.whatsappNumber,
            whatsappNumberDisplay: settings.whatsappNumberDisplay,
            instagramUrl: settings.instagramUrl,
            tiktokUrl: settings.tiktokUrl,
            bannerText: settings.bannerText ?? null,
            bannerEnabled: !!settings.bannerEnabled,
            freeShipThreshold: settings.freeShipThreshold ?? null,
            sstEnabled: !!settings.sstEnabled,
            sstRate: settings.sstRate,
          }}
        />
      </div>
    </main>
  );
}
