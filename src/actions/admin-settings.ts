"use server";

import { db } from "@/lib/db";
import { storeSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { storeSettingsSchema } from "@/lib/validators";
import {
  clearStoreSettingsCache,
  getStoreSettingsCached,
} from "@/lib/store-settings";

// ============================================================================
// Plan 05-04 admin store-settings actions.
//
// IMPORTANT (T-05-04-EoP): requireAdmin() FIRST in every export.
// IMPORTANT (T-05-04-injection): all inputs Zod-validated server-side.
//
// Cache: getStoreSettings is cached 60s in-memory (src/lib/store-settings.ts).
// updateStoreSettings invalidates the cache + revalidates every storefront
// path that renders settings (banner, footer, contact pages).
// ============================================================================

export async function getStoreSettings() {
  await requireAdmin();
  return getStoreSettingsCached();
}

// Phase 11 alias — public (non-admin) read path used by the storefront footer
// + /contact page. Lazy-seeds the singleton on first call (same helper). No
// admin gate because the footer renders for anonymous visitors.
export async function getSiteSettings() {
  return getStoreSettingsCached();
}

type UpdateResult = { ok: true } | { ok: false; error: string };

export async function updateStoreSettings(
  formData: FormData,
): Promise<UpdateResult> {
  await requireAdmin();
  const parsed = storeSettingsSchema.safeParse({
    businessName: formData.get("businessName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone") || "",
    whatsappNumber: formData.get("whatsappNumber"),
    whatsappNumberDisplay: formData.get("whatsappNumberDisplay"),
    instagramUrl: formData.get("instagramUrl") || "",
    tiktokUrl: formData.get("tiktokUrl") || "",
    twitterUrl: formData.get("twitterUrl") || "",
    whatsappUrl: formData.get("whatsappUrl") || "",
    facebookUrl: formData.get("facebookUrl") || "",
    likeUrl: formData.get("likeUrl") || "",
    bannerText: formData.get("bannerText") || null,
    bannerEnabled: formData.get("bannerEnabled") === "true",
    freeShipThreshold: formData.get("freeShipThreshold") || null,
    sstEnabled: formData.get("sstEnabled") === "true",
    sstRate: formData.get("sstRate") || "6.00",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  // Ensure singleton row exists before update (lazy seed on first save)
  await getStoreSettingsCached();

  await db
    .update(storeSettings)
    .set({
      businessName: data.businessName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      whatsappNumber: data.whatsappNumber,
      whatsappNumberDisplay: data.whatsappNumberDisplay,
      instagramUrl: data.instagramUrl || "#",
      tiktokUrl: data.tiktokUrl || "#",
      twitterUrl: data.twitterUrl,
      whatsappUrl: data.whatsappUrl,
      facebookUrl: data.facebookUrl,
      likeUrl: data.likeUrl,
      bannerText: data.bannerText ?? null,
      bannerEnabled: data.bannerEnabled,
      freeShipThreshold: data.freeShipThreshold ?? null,
      sstEnabled: data.sstEnabled,
      sstRate: data.sstRate,
    })
    .where(eq(storeSettings.id, "default"));

  clearStoreSettingsCache();
  revalidatePath("/", "layout");
  revalidatePath("/about");
  revalidatePath("/contact");
  revalidatePath("/privacy");
  revalidatePath("/terms");
  return { ok: true };
}

export async function invalidateSettingsCache(): Promise<{ ok: true }> {
  await requireAdmin();
  clearStoreSettingsCache();
  return { ok: true };
}
