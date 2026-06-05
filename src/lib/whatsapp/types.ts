/**
 * Shared WhatsApp types and constants.
 *
 * NOT "use server" — safe to import from both client and server.
 * No server-only imports here.
 */

export const WHATSAPP_INSTANCE_NAME = "3dninjaz";

export type WhatsappConnectionState = "close" | "connecting" | "open";

export type WhatsappSettingsView = {
  instanceName: string;
  connectionState: WhatsappConnectionState;
  connectedNumber: string | null;
  notificationsEnabled: boolean;
  lastConnectedAt: string | null; // ISO, serialised for client
  lastQrAt: string | null;
};

export type WhatsappNotificationRow = {
  eventKey: string;
  enabled: boolean;
  template: string;
};

// Result shapes returned by the QR-panel server actions to the client.
export type ConnectResult =
  | { ok: true; qr: string | null; state: WhatsappConnectionState }
  | { ok: false; error: string };

export type StateResult =
  | { ok: true; state: WhatsappConnectionState; connectedNumber: string | null }
  | { ok: false; error: string };
