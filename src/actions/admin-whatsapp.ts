"use server";

/**
 * WhatsApp QR-panel server actions.
 *
 * "use server" — ONLY async function exports (no type/const re-exports).
 * requireAdmin() is the FIRST await in every export (CVE-2025-29927).
 *
 * Types imported from @/lib/whatsapp/types (non-"use server" module).
 */

import { requireAdmin } from "@/lib/auth-helpers";
import {
  getWhatsappSettingsCached,
  updateWhatsappConnectionState,
  setNotificationsEnabled,
} from "@/lib/whatsapp/settings";
import {
  createInstance,
  setWebhook,
  getQr,
  getConnectionState,
  logout,
} from "@/lib/whatsapp/client";
import type {
  WhatsappSettingsView,
  ConnectResult,
  StateResult,
} from "@/lib/whatsapp/types";
import { publicOrigin } from "@/lib/public-url";

const APP_BASE_URL =
  process.env.APP_BASE_URL ?? publicOrigin();

// ---------------------------------------------------------------------------
// getWhatsappAdminState
// ---------------------------------------------------------------------------

export async function getWhatsappAdminState(): Promise<WhatsappSettingsView> {
  await requireAdmin();

  // Ensure the row exists (lazy seed on first call)
  const row = await getWhatsappSettingsCached();

  return {
    instanceName: row.instanceName,
    connectionState: row.connectionState,
    connectedNumber: row.connectedNumber ?? null,
    notificationsEnabled: Boolean(row.notificationsEnabled),
    lastConnectedAt: row.lastConnectedAt
      ? new Date(row.lastConnectedAt).toISOString()
      : null,
    lastQrAt: row.lastQrAt ? new Date(row.lastQrAt).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// connectWhatsapp
// ---------------------------------------------------------------------------

export async function connectWhatsapp(): Promise<ConnectResult> {
  await requireAdmin();

  try {
    await createInstance();
    // Best-effort webhook registration. Include the shared secret as a query
    // param so the receiver can authenticate Evolution's callbacks (the route
    // drops any POST without it). Mirrors the Delyva optional-secret pattern.
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
    const webhookUrl = `${APP_BASE_URL}/api/webhooks/evolution${
      secret ? `?secret=${encodeURIComponent(secret)}` : ""
    }`;
    void setWebhook(webhookUrl);
    const qr = await getQr();
    await updateWhatsappConnectionState("connecting", undefined, { qr: true });
    return { ok: true, qr, state: "connecting" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// pollWhatsappState
// ---------------------------------------------------------------------------

export async function pollWhatsappState(): Promise<StateResult> {
  await requireAdmin();

  try {
    const { state, number } = await getConnectionState();
    // Only persist connectedNumber when Evolution returns one (non-null).
    // The connected number is usually set by the CONNECTION_UPDATE webhook;
    // this poll endpoint returns null for number — preserve the stored value.
    await updateWhatsappConnectionState(
      state,
      number !== null ? number : undefined,
    );
    // Re-read the stored connectedNumber (may have been set by webhook earlier)
    const row = await getWhatsappSettingsCached();
    return {
      ok: true,
      state,
      connectedNumber: row.connectedNumber ?? null,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// refreshWhatsappQr
// ---------------------------------------------------------------------------

export async function refreshWhatsappQr(): Promise<ConnectResult> {
  await requireAdmin();

  try {
    const qr = await getQr();
    if (qr) {
      await updateWhatsappConnectionState("connecting", undefined, { qr: true });
    }
    return { ok: true, qr, state: "connecting" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// disconnectWhatsapp
// ---------------------------------------------------------------------------

export async function disconnectWhatsapp(): Promise<{ ok: boolean }> {
  await requireAdmin();

  try {
    await logout();
    await updateWhatsappConnectionState("close", null);
    return { ok: true };
  } catch {
    // best-effort
    await updateWhatsappConnectionState("close", null);
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// setWhatsappMasterToggle
// ---------------------------------------------------------------------------

export async function setWhatsappMasterToggle(
  enabled: boolean,
): Promise<{ ok: true }> {
  await requireAdmin();
  await setNotificationsEnabled(enabled);
  return { ok: true };
}
