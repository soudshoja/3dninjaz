"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { updateShippingRates } from "@/actions/admin-shipping";
import { updateStoreSettings } from "@/actions/admin-settings";

type Rate = { id: string; state: string; flatRate: string };

type Props = {
  rates: Rate[];
  initialFreeShipThreshold: string | null;
  // We need the rest of settings to round-trip the save (the action expects
  // the full payload). Pass them in so we can re-submit via FormData.
  settingsSnapshot: {
    businessName: string;
    contactEmail: string;
    whatsappNumber: string;
    whatsappNumberDisplay: string;
    instagramUrl: string;
    tiktokUrl: string;
    bannerText: string | null;
    bannerEnabled: boolean;
    sstEnabled: boolean;
    sstRate: string;
  };
};

/**
 * /admin/shipping form. Renders 16 MY-state rate inputs + a free-ship
 * threshold field. Saves rates in a single transaction via
 * updateShippingRates, then separately updates the threshold via
 * updateStoreSettings (the threshold lives on store_settings).
 */
export function ShippingRatesForm({
  rates,
  initialFreeShipThreshold,
  settingsSnapshot,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(rates.map((r) => [r.state, r.flatRate])),
  );
  const [freeShipThreshold, setFreeShipThreshold] = useState<string>(
    initialFreeShipThreshold ?? "",
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const entries = rates.map((r) => ({
      state: r.state,
      flatRate: values[r.state] ?? "0.00",
    }));

    startTransition(async () => {
      const ratesRes = await updateShippingRates(entries);
      if (!ratesRes.ok) {
        setError(ratesRes.error);
        return;
      }
      // Persist threshold via storeSettings update (settings round-trip).
      const fd = new FormData();
      fd.set("businessName", settingsSnapshot.businessName);
      fd.set("contactEmail", settingsSnapshot.contactEmail);
      fd.set("whatsappNumber", settingsSnapshot.whatsappNumber);
      fd.set("whatsappNumberDisplay", settingsSnapshot.whatsappNumberDisplay);
      fd.set("instagramUrl", settingsSnapshot.instagramUrl);
      fd.set("tiktokUrl", settingsSnapshot.tiktokUrl);
      fd.set("bannerText", settingsSnapshot.bannerText ?? "");
      fd.set("bannerEnabled", settingsSnapshot.bannerEnabled ? "true" : "false");
      fd.set("freeShipThreshold", freeShipThreshold.trim());
      fd.set("sstEnabled", settingsSnapshot.sstEnabled ? "true" : "false");
      fd.set("sstRate", settingsSnapshot.sstRate);
      const settingsRes = await updateStoreSettings(fd);
      if (!settingsRes.ok) {
        setError(`Rates saved; threshold update failed: ${settingsRes.error}`);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
      style={{ color: BRAND.ink }}
    >
      <section
        className="rounded-2xl border-2 p-5"
        style={{ borderColor: `${BRAND.ink}22`, backgroundColor: "#ffffff" }}
      >
        <h2 className="font-[var(--font-heading)] text-xl mb-3">
          Free-shipping threshold
        </h2>
        <label
          htmlFor="freeShipThreshold"
          className="block text-sm font-semibold mb-1"
        >
          Order subtotal at which shipping becomes free (MYR)
        </label>
        <input
          id="freeShipThreshold"
          type="text"
          inputMode="decimal"
          pattern="\d+(\.\d{1,2})?"
          value={freeShipThreshold}
          onChange={(e) =>
            setFreeShipThreshold(e.target.value.slice(0, 10))
          }
          placeholder="200.00 (or blank to disable)"
          className="w-full max-w-xs rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
        />
      </section>

      <section
        className="rounded-2xl border-2 p-5"
        style={{ borderColor: `${BRAND.ink}22`, backgroundColor: "#ffffff" }}
      >
        <h2 className="font-[var(--font-heading)] text-xl mb-3">
          Per-state flat rates
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Charged at checkout when the subtotal is below the free-ship
          threshold. Set 0.00 for any state you ship free unconditionally.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {rates.map((r) => (
            <div key={r.state} className="flex items-center gap-2">
              <label
                htmlFor={`rate-${r.state}`}
                className="flex-1 text-sm font-semibold"
              >
                {r.state}
              </label>
              <span className="text-sm text-slate-500">RM</span>
              <input
                id={`rate-${r.state}`}
                type="text"
                inputMode="decimal"
                pattern="\d+(\.\d{1,2})?"
                value={values[r.state] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [r.state]: e.target.value.slice(0, 8),
                  }))
                }
                className="w-24 rounded-xl border-2 px-3 py-2 text-sm min-h-[40px] text-right font-mono"
                style={{ borderColor: `${BRAND.ink}33` }}
              />
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      ) : null}
      {saved ? (
        <p
          role="status"
          className="rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ backgroundColor: `${BRAND.green}22`, color: BRAND.ink }}
        >
          Shipping rates saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50 sticky bottom-4"
        style={{ backgroundColor: BRAND.ink }}
      >
        {pending ? "Saving…" : "Save all rates"}
      </button>
    </form>
  );
}
