"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { updateStoreSettings } from "@/actions/admin-settings";

type Initial = {
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber: string;
  whatsappNumberDisplay: string;
  instagramUrl: string;
  tiktokUrl: string;
  twitterUrl: string;
  whatsappUrl: string;
  facebookUrl: string;
  likeUrl: string;
  bannerText: string | null;
  bannerEnabled: boolean;
  freeShipThreshold: string | null;
  sstEnabled: boolean;
  sstRate: string;
};

// Phase 11 — social platforms rendered with branded ninja icons. The `key`
// matches the form field + DB column basename (so `twitter` → `twitter_url`).
// Any row whose URL is empty at save time will be hidden on the storefront
// (SocialLinks component filters nulls/empties).
const SOCIAL_ROWS = [
  {
    key: "twitter",
    label: "Twitter / X URL",
    placeholder: "https://twitter.com/3dninjaz",
    icon: "/icons/ninja/social/twitter.png",
  },
  {
    key: "whatsapp",
    label: "WhatsApp link (wa.me/...)",
    placeholder: "https://wa.me/60123456789",
    icon: "/icons/ninja/social/whatsapp.png",
  },
  {
    key: "instagram",
    label: "Instagram URL",
    placeholder: "https://instagram.com/3dninjaz",
    icon: "/icons/ninja/social/instagram.png",
  },
  {
    key: "facebook",
    label: "Facebook URL",
    placeholder: "https://facebook.com/3dninjaz",
    icon: "/icons/ninja/social/facebook.png",
  },
  {
    key: "tiktok",
    label: "TikTok URL",
    placeholder: "https://tiktok.com/@3dninjaz",
    icon: "/icons/ninja/social/tiktok.png",
  },
  {
    key: "like",
    label: "Review link (Google review / Trustpilot / extra)",
    placeholder: "https://g.page/r/…",
    icon: "/icons/ninja/social/like.png",
  },
] as const;

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

      {/* ============================================================
          Social & Contact (Phase 11)
          Each social row is optional — leave blank to hide that icon
          from the storefront footer and /contact page.
          ============================================================ */}
      <section
        className="rounded-2xl border-2 p-5 space-y-5"
        style={{ borderColor: `${BRAND.ink}22`, backgroundColor: "#FAFAFA" }}
        aria-labelledby="sf-social-heading"
      >
        <div>
          <h2
            id="sf-social-heading"
            className="font-[var(--font-heading)] text-lg"
          >
            Social & Contact
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Leave any URL blank to hide that icon from the storefront.
          </p>
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
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px] bg-white"
            style={{ borderColor: `${BRAND.ink}33` }}
          />
        </div>

        <div>
          <label
            htmlFor="sf-contactPhone"
            className="block text-sm font-semibold mb-1"
          >
            Contact phone (optional)
          </label>
          <input
            id="sf-contactPhone"
            name="contactPhone"
            type="text"
            maxLength={32}
            defaultValue={initial.contactPhone}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px] bg-white"
            style={{ borderColor: `${BRAND.ink}33` }}
            placeholder="+60 3-1234 5678"
          />
          <p className="mt-1 text-xs text-slate-500">
            Displayed as a <code>tel:</code> link. Leave blank to hide.
          </p>
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
              className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px] bg-white"
              style={{ borderColor: `${BRAND.ink}33` }}
              placeholder="60167203048"
            />
            <p className="mt-1 text-xs text-slate-500">
              E.164 digits, no &ldquo;+&rdquo;. Used to build wa.me deep-links.
            </p>
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
              className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px] bg-white"
              style={{ borderColor: `${BRAND.ink}33` }}
              placeholder="+60 16 720 3048"
            />
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold">Social platform URLs</p>
          {SOCIAL_ROWS.map((row) => {
            const initialKey = `${row.key}Url` as
              | "twitterUrl"
              | "whatsappUrl"
              | "instagramUrl"
              | "facebookUrl"
              | "tiktokUrl"
              | "likeUrl";
            const nameKey = `${row.key}Url`;
            const defaultVal = initial[initialKey] ?? "";
            return (
              <div key={row.key} className="flex items-start gap-3">
                <Image
                  src={row.icon}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 object-contain rounded-lg bg-white"
                />
                <div className="flex-1">
                  <label
                    htmlFor={`sf-${nameKey}`}
                    className="block text-sm font-semibold mb-1"
                  >
                    {row.label}
                  </label>
                  <input
                    id={`sf-${nameKey}`}
                    name={nameKey}
                    type="url"
                    defaultValue={
                      defaultVal === "#" ? "" : defaultVal
                    }
                    className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px] bg-white"
                    style={{ borderColor: `${BRAND.ink}33` }}
                    placeholder={row.placeholder}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

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
