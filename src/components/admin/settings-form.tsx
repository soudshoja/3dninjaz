"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { updateStoreSettings } from "@/actions/admin-settings";

type Initial = {
  businessName: string;
  contactEmail: string;
  whatsappNumber: string;
  whatsappNumberDisplay: string;
  instagramUrl: string;
  tiktokUrl: string;
  bannerText: string | null;
  bannerEnabled: boolean;
  freeShipThreshold: string | null;
  sstEnabled: boolean;
  sstRate: string;
};

/**
 * /admin/settings form. Submits via updateStoreSettings server action.
 *
 * Tap targets: every input + Submit ≥ 48px (D-04). Stacks vertically below
 * `md`. Server cache invalidates on success → next request reads fresh
 * values; client refresh is forced via router.refresh().
 */
export function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateStoreSettings(fd);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 max-w-2xl"
      style={{ color: BRAND.ink }}
    >
      <div>
        <label
          htmlFor="sf-businessName"
          className="block text-sm font-semibold mb-1"
        >
          Business name
        </label>
        <input
          id="sf-businessName"
          name="businessName"
          type="text"
          required
          maxLength={200}
          defaultValue={initial.businessName}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
        />
      </div>

      <div>
        <label
          htmlFor="sf-contactEmail"
          className="block text-sm font-semibold mb-1"
        >
          Contact email
        </label>
        <input
          id="sf-contactEmail"
          name="contactEmail"
          type="email"
          required
          defaultValue={initial.contactEmail}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="sf-whatsappNumber"
            className="block text-sm font-semibold mb-1"
          >
            WhatsApp number (digits only)
          </label>
          <input
            id="sf-whatsappNumber"
            name="whatsappNumber"
            type="text"
            inputMode="numeric"
            pattern="\d{7,15}"
            required
            defaultValue={initial.whatsappNumber}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
            placeholder="60123456789"
          />
        </div>
        <div>
          <label
            htmlFor="sf-whatsappNumberDisplay"
            className="block text-sm font-semibold mb-1"
          >
            WhatsApp display
          </label>
          <input
            id="sf-whatsappNumberDisplay"
            name="whatsappNumberDisplay"
            type="text"
            required
            defaultValue={initial.whatsappNumberDisplay}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
            placeholder="+60 12 345 6789"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="sf-instagramUrl"
            className="block text-sm font-semibold mb-1"
          >
            Instagram URL
          </label>
          <input
            id="sf-instagramUrl"
            name="instagramUrl"
            type="url"
            defaultValue={initial.instagramUrl}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
            placeholder="https://instagram.com/3dninjaz"
          />
        </div>
        <div>
          <label
            htmlFor="sf-tiktokUrl"
            className="block text-sm font-semibold mb-1"
          >
            TikTok URL
          </label>
          <input
            id="sf-tiktokUrl"
            name="tiktokUrl"
            type="url"
            defaultValue={initial.tiktokUrl}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
            placeholder="https://tiktok.com/@3dninjaz"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="sf-bannerText"
          className="block text-sm font-semibold mb-1"
        >
          Banner text (optional)
        </label>
        <input
          id="sf-bannerText"
          name="bannerText"
          type="text"
          maxLength={500}
          defaultValue={initial.bannerText ?? ""}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
          placeholder="Free shipping over MYR 200!"
        />
        <label className="mt-2 inline-flex items-center gap-2">
          <input
            type="checkbox"
            name="bannerEnabled"
            value="true"
            defaultChecked={initial.bannerEnabled}
            className="h-5 w-5 rounded"
          />
          <span className="text-sm font-semibold">Show banner on storefront</span>
        </label>
      </div>

      <div>
        <label
          htmlFor="sf-freeShipThreshold"
          className="block text-sm font-semibold mb-1"
        >
          Free-shipping threshold (MYR, optional)
        </label>
        <input
          id="sf-freeShipThreshold"
          name="freeShipThreshold"
          type="text"
          inputMode="decimal"
          pattern="\d+(\.\d{1,2})?"
          defaultValue={initial.freeShipThreshold ?? ""}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
          placeholder="200.00"
        />
        <p className="mt-1 text-xs text-slate-500">
          When the order subtotal is ≥ this value, shipping is set to 0.
          Leave blank to disable.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="inline-flex items-center gap-2">
            <input
              name="sstEnabled"
              type="checkbox"
              value="true"
              defaultChecked={initial.sstEnabled}
              className="h-5 w-5 rounded"
            />
            <span className="text-sm font-semibold">Apply SST on orders</span>
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Default OFF (Phase 4 D-03). Toggle when you register for SST.
          </p>
        </div>
        <div>
          <label
            htmlFor="sf-sstRate"
            className="block text-sm font-semibold mb-1"
          >
            SST rate (%)
          </label>
          <input
            id="sf-sstRate"
            name="sstRate"
            type="text"
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={initial.sstRate}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          />
        </div>
      </div>

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
          Settings saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
        style={{ backgroundColor: BRAND.ink }}
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
