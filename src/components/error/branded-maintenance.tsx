import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { getStoreSettingsCached } from "@/lib/store-settings";

/**
 * Phase 7 (07-09) — branded maintenance page body.
 *
 * Server component — reads store settings to wire up the WhatsApp link
 * (admin can update the number from /admin/settings without redeploy).
 */
export async function BrandedMaintenance() {
  let waNumber = "";
  let waDisplay = "";
  try {
    const s = await getStoreSettingsCached();
    waNumber = s.whatsappNumber;
    waDisplay = s.whatsappNumberDisplay;
  } catch {
    // settings unavailable — render without contact link
  }
  const waUrl = waNumber ? `https://wa.me/${waNumber}` : null;

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="max-w-lg w-full text-center">
        <Image
          src="/icons/ninja/errors/maintenance.png"
          alt="3D Ninjaz ninja in a hard hat next to a barricade — under maintenance"
          width={256}
          height={256}
          sizes="256px"
          priority
          className="mx-auto mb-6 h-[256px] w-[256px] object-contain"
        />
        <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl mb-3">
          We are training the ninja
        </h1>
        <p className="text-slate-700 mb-6">
          The shop is briefly unavailable for maintenance. We will be back
          shortly. Thanks for your patience.
        </p>
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 text-white font-semibold"
            style={{ backgroundColor: BRAND.green }}
          >
            Contact us on WhatsApp{waDisplay ? ` (${waDisplay})` : ""}
          </a>
        ) : null}
      </div>
    </main>
  );
}
