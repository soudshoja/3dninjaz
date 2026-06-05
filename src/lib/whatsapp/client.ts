/**
 * Evolution API HTTP client (server-only).
 *
 * Plain server module — NOT "use server". May export sync types/consts
 * AND async functions. All functions are best-effort: they throw on hard
 * failure so callers can try/catch; sendText never throws (returns boolean).
 */
import "server-only";
import { WHATSAPP_INSTANCE_NAME } from "@/lib/whatsapp/types";

const BASE = process.env.EVOLUTION_API_URL ?? "http://127.0.0.1:8080";
const KEY = process.env.EVOLUTION_API_KEY ?? "";

function headers(): Record<string, string> {
  return { "Content-Type": "application/json", apikey: KEY };
}

async function evoFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...((init?.headers as Record<string, string>) ?? {}) },
    cache: "no-store",
  });
  return res;
}

/**
 * Create an Evolution instance. Treats HTTP 403/409 as success (Evolution
 * returns 403 when the instance name is already taken).
 */
export async function createInstance(
  instanceName = WHATSAPP_INSTANCE_NAME,
): Promise<void> {
  const res = await evoFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    }),
  });
  // 403 = already exists (Evolution v2 conflict behaviour), 409 = same intent.
  if (!res.ok && res.status !== 403 && res.status !== 409) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[evolution] createInstance failed: HTTP ${res.status} — ${body}`,
    );
  }
}

/**
 * Get the current QR code for an instance.
 * Returns the raw QR string (`code`), a base64 data-URI PNG (`base64`), or
 * null if neither is present in the response.
 */
export async function getQr(
  instanceName = WHATSAPP_INSTANCE_NAME,
): Promise<string | null> {
  const res = await evoFetch(`/instance/connect/${instanceName}`);
  if (!res.ok) return null;
  try {
    const json = await res.json() as Record<string, unknown>;
    // Evolution v2: { code, base64, pairingCode }
    // Prefer `code` (raw QR string); fall back to `base64` (data-URI PNG).
    const code = json.code ?? json.base64 ?? null;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

/**
 * Get the connection state of an instance.
 * Returns { state, number } — `number` is null here as this endpoint doesn't
 * return it reliably; the connected number is captured from the webhook instead.
 */
export async function getConnectionState(
  instanceName = WHATSAPP_INSTANCE_NAME,
): Promise<{ state: "close" | "connecting" | "open"; number: string | null }> {
  try {
    const res = await evoFetch(`/instance/connectionState/${instanceName}`);
    if (!res.ok) return { state: "close", number: null };
    const json = await res.json() as Record<string, unknown>;
    const instance = json.instance as Record<string, unknown> | undefined;
    const rawState = instance?.state ?? json.state;
    const state = rawState === "open"
      ? "open"
      : rawState === "connecting"
      ? "connecting"
      : "close";
    return { state, number: null };
  } catch {
    return { state: "close", number: null };
  }
}

/**
 * Logout and delete the instance (best-effort — swallows errors).
 */
export async function logout(
  instanceName = WHATSAPP_INSTANCE_NAME,
): Promise<void> {
  try {
    await evoFetch(`/instance/logout/${instanceName}`, { method: "DELETE" });
  } catch {
    // ignore
  }
  try {
    await evoFetch(`/instance/delete/${instanceName}`, { method: "DELETE" });
  } catch {
    // ignore
  }
}

/**
 * Send a text message via Evolution. Returns true on HTTP 2xx, false otherwise.
 * Never throws.
 */
export async function sendText(opts: {
  number: string;
  text: string;
  instanceName?: string;
}): Promise<boolean> {
  const name = opts.instanceName ?? WHATSAPP_INSTANCE_NAME;
  try {
    const res = await evoFetch(`/message/sendText/${name}`, {
      method: "POST",
      body: JSON.stringify({ number: opts.number, text: opts.text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send a media document via Evolution. Returns true on HTTP 2xx, false otherwise.
 * Never throws. Best-effort — swallows all errors.
 *
 * @param number   - E.164 MSISDN without the + prefix, e.g. "601125434730"
 * @param base64   - Raw base64-encoded file data (no data: URI prefix)
 * @param fileName - Filename shown to the recipient, e.g. "invoice-ORD-001.pdf"
 * @param caption  - Optional caption text below the document
 */
export async function sendMedia(opts: {
  number: string;
  base64: string;
  fileName: string;
  caption?: string;
  instanceName?: string;
}): Promise<boolean> {
  const name = opts.instanceName ?? WHATSAPP_INSTANCE_NAME;
  try {
    const res = await evoFetch(`/message/sendMedia/${name}`, {
      method: "POST",
      body: JSON.stringify({
        number: opts.number,
        mediatype: "document",
        media: opts.base64,
        fileName: opts.fileName,
        caption: opts.caption ?? "",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Register a webhook URL on an Evolution instance (best-effort — swallows errors).
 *
 * Evolution v2 wraps the config under a "webhook" key:
 *   { webhook: { enabled, url, webhookByEvents, events } }
 *
 * NOTE: if the deployed Evolution build rejects the wrapped shape with HTTP 400,
 * fall back to the flat body: { url, enabled, events } and update this function.
 * Both shapes are documented in Evolution API v2 changelog.
 */
export async function setWebhook(
  url: string,
  instanceName = WHATSAPP_INSTANCE_NAME,
): Promise<void> {
  try {
    await evoFetch(`/webhook/set/${instanceName}`, {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url,
          webhookByEvents: false,
          events: ["QRCODE_UPDATED", "CONNECTION_UPDATE"],
        },
      }),
    });
  } catch {
    // best-effort
  }
}
