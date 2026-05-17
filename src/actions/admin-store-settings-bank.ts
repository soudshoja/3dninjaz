"use server";

import { db } from "@/lib/db";
import { storeSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  clearStoreSettingsCache,
  getStoreSettingsCached,
  invalidateStoreSettingsCache,
} from "@/lib/store-settings";

/**
 * Phase 20 (20-04) — admin server actions for bank details + draft link template.
 *
 * Separate from admin-settings.ts to keep the diff surgical. Both actions here
 * write to the single store_settings singleton row (id='default') and invalidate
 * the in-memory 60s cache so the draft page reflects changes immediately.
 *
 * Every export awaits `requireAdmin()` as the FIRST await (CVE-2025-29927).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BankDetailsInput = {
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
};

export type SaveBankDetailsResult = { ok: true } | { ok: false; error: string };
export type SaveDraftLinkTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// saveStoreBankDetails
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save (or clear) bank name, account number, and account holder on the
 * store_settings singleton row.
 *
 * Empty-string inputs are normalised to null (D-16 empty-state guard) — if any
 * of the three fields is NULL the Bank Transfer card is hidden on the customer
 * draft page.
 *
 * Passing all three as null is a supported "clear" operation.
 */
export async function saveStoreBankDetails(
  input: BankDetailsInput,
): Promise<SaveBankDetailsResult> {
  const session = await requireAdmin(); // CVE-2025-29927 — FIRST await

  // Normalise empty strings to null
  const bankName = input.bankName?.trim() || null;
  const bankAccountNumber = input.bankAccountNumber?.trim() || null;
  const bankAccountHolder = input.bankAccountHolder?.trim() || null;

  // Ensure the singleton row exists before UPDATE (lazy seed)
  await getStoreSettingsCached();

  try {
    await db
      .update(storeSettings)
      .set({ bankName, bankAccountNumber, bankAccountHolder })
      .where(eq(storeSettings.id, "default"));
  } catch (err) {
    console.error(
      "[admin-store-settings-bank] saveStoreBankDetails failed:",
      err,
    );
    return { ok: false, error: "Could not save bank details." };
  }

  // Invalidate cache + revalidate pages that render the bank details
  invalidateStoreSettingsCache();
  revalidatePath("/admin/settings");
  revalidatePath("/payment-links/[token]", "page");

  void session; // session used for requireAdmin gate; no per-user data here
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// saveDraftLinkTemplate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save (or clear) the Mustache-style WhatsApp/email draft link template.
 *
 * Passing null or an empty string clears the template; the send-draft helper
 * will fall back to a hardcoded default when this is NULL.
 */
export async function saveDraftLinkTemplate(input: {
  draftLinkTemplate: string | null;
}): Promise<SaveDraftLinkTemplateResult> {
  const session = await requireAdmin(); // CVE-2025-29927 — FIRST await

  // Normalise empty string to null
  const draftLinkTemplate = input.draftLinkTemplate?.trim() || null;

  // Ensure the singleton row exists before UPDATE (lazy seed)
  await getStoreSettingsCached();

  try {
    await db
      .update(storeSettings)
      .set({ draftLinkTemplate })
      .where(eq(storeSettings.id, "default"));
  } catch (err) {
    console.error(
      "[admin-store-settings-bank] saveDraftLinkTemplate failed:",
      err,
    );
    return { ok: false, error: "Could not save draft link template." };
  }

  // Invalidate cache + revalidate admin settings page
  clearStoreSettingsCache();
  revalidatePath("/admin/settings");
  revalidatePath("/payment-links/[token]", "page");

  void session; // session used for requireAdmin gate; no per-user data here
  return { ok: true };
}
