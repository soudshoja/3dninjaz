"use server";

/**
 * WhatsApp Notification Center server actions.
 *
 * "use server" — ONLY async function exports (no type/const re-exports).
 * requireAdmin() is the FIRST await in every export (CVE-2025-29927).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { whatsappNotifications } from "@/lib/db/schema";
import {
  getWhatsappNotificationsAll,
} from "@/lib/whatsapp/settings";
import { WHATSAPP_EVENT_KEYS } from "@/lib/whatsapp/events";
import type { WhatsappNotificationRow } from "@/lib/whatsapp/types";

// ---------------------------------------------------------------------------
// listWhatsappNotifications
// ---------------------------------------------------------------------------

export async function listWhatsappNotifications(): Promise<
  WhatsappNotificationRow[]
> {
  await requireAdmin();
  return getWhatsappNotificationsAll();
}

// ---------------------------------------------------------------------------
// updateWhatsappNotification
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  eventKey: z.enum(WHATSAPP_EVENT_KEYS),
  enabled: z.boolean(),
  template: z.string().min(1, "Template cannot be empty.").max(2000, "Template too long (max 2000 chars)."),
});

export async function updateWhatsappNotification(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const raw = {
    eventKey: formData.get("eventKey"),
    enabled: formData.get("enabled") === "true",
    template: (formData.get("template") as string | null)?.trim() ?? "",
  };

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { eventKey, enabled, template } = parsed.data;

  await db
    .update(whatsappNotifications)
    .set({ enabled, template })
    .where(eq(whatsappNotifications.eventKey, eventKey));

  return { ok: true };
}
