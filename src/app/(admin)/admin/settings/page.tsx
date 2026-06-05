import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { getStoreSettings } from "@/actions/admin-settings";
import { BRAND } from "@/lib/brand";
import { SettingsForm } from "@/components/admin/settings-form";
import { BankDetailsFieldset } from "@/components/admin/bank-details-fieldset";
import { DraftTemplateFieldset } from "@/components/admin/draft-template-fieldset";
import { WhatsappConnectPanel } from "@/components/admin/whatsapp-connect-panel";
import { getWhatsappAdminState } from "@/actions/admin-whatsapp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Settings",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [settings, whatsapp] = await Promise.all([
    getStoreSettings(),
    getWhatsappAdminState(),
  ]);

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
            contactPhone: settings.contactPhone ?? "",
            whatsappNumber: settings.whatsappNumber,
            whatsappNumberDisplay: settings.whatsappNumberDisplay,
            instagramUrl: settings.instagramUrl,
            tiktokUrl: settings.tiktokUrl,
            twitterUrl: settings.twitterUrl ?? "",
            whatsappUrl: settings.whatsappUrl ?? "",
            facebookUrl: settings.facebookUrl ?? "",
            likeUrl: settings.likeUrl ?? "",
            bannerText: settings.bannerText ?? null,
            bannerEnabled: !!settings.bannerEnabled,
            freeShipThreshold: settings.freeShipThreshold ?? null,
            sstEnabled: !!settings.sstEnabled,
            sstRate: settings.sstRate,
            // Phase 14 — cost defaults
            defaultFilamentCostPerKg: settings.defaultFilamentCostPerKg ?? "",
            defaultElectricityCostPerKwh: settings.defaultElectricityCostPerKwh ?? "",
            defaultElectricityKwhPerHour: settings.defaultElectricityKwhPerHour ?? "",
            defaultLaborRatePerHour: settings.defaultLaborRatePerHour ?? "",
            defaultOverheadPercent: settings.defaultOverheadPercent ?? "0",
          }}
        />

        {/* Phase 20 (20-12) — Bank Details fieldset (below Contact, above Socials visual order) */}
        <div className="mt-8 max-w-2xl space-y-6">
          <BankDetailsFieldset
            initialBankName={settings.bankName ?? null}
            initialBankAccountNumber={settings.bankAccountNumber ?? null}
            initialBankAccountHolder={settings.bankAccountHolder ?? null}
          />

          {/* Phase 20 (20-12) — Draft order message template fieldset */}
          <DraftTemplateFieldset
            initialTemplate={settings.draftLinkTemplate ?? null}
          />

          {/* WhatsApp QR connect panel + master toggle */}
          <WhatsappConnectPanel initial={whatsapp} />
        </div>
      </div>
    </main>
  );
}
