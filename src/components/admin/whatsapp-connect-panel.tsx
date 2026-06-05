"use client";

/**
 * WhatsApp QR connect panel for /admin/settings.
 *
 * Renders a QR code (or base64 PNG) returned from Evolution API, polls for
 * connection state, and provides a master toggle for notifications.
 *
 * QR rendering:
 *   - If Evolution returns a base64 data-URI (qr.startsWith("data:")), render
 *     it directly as <img>.
 *   - Otherwise treat as a raw QR payload string and render via QRCodeCanvas
 *     from qrcode.react.
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Loader2, CheckCircle2, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { BRAND } from "@/lib/brand";
import type { WhatsappSettingsView } from "@/lib/whatsapp/types";
import {
  connectWhatsapp,
  pollWhatsappState,
  refreshWhatsappQr,
  disconnectWhatsapp,
  setWhatsappMasterToggle,
} from "@/actions/admin-whatsapp";

interface Props {
  initial: WhatsappSettingsView;
}

const POLL_INTERVAL_MS = 3_000;
const QR_REFRESH_MS = 40_000;

export function WhatsappConnectPanel({ initial }: Props) {
  const [state, setState] = useState(initial.connectionState);
  const [qr, setQr] = useState<string | null>(null);
  const [connectedNumber, setConnectedNumber] = useState(
    initial.connectedNumber,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    initial.notificationsEnabled,
  );
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [connecting, startConnect] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [toggling, startToggle] = useTransition();

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingStartedAt = useRef<number | null>(null);

  // ------------------------------------------------------------------
  // Polling cleanup
  // ------------------------------------------------------------------
  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (qrRefreshTimeoutRef.current) {
      clearTimeout(qrRefreshTimeoutRef.current);
      qrRefreshTimeoutRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  // ------------------------------------------------------------------
  // Polling logic
  // ------------------------------------------------------------------
  function startPolling() {
    stopPolling();
    connectingStartedAt.current = Date.now();

    // Schedule QR refresh after ~40s (QR codes expire)
    qrRefreshTimeoutRef.current = setTimeout(async () => {
      if (state !== "open") {
        const res = await refreshWhatsappQr();
        if (res.ok && res.qr) setQr(res.qr);
      }
    }, QR_REFRESH_MS);

    pollIntervalRef.current = setInterval(async () => {
      const res = await pollWhatsappState();
      if (!res.ok) return;

      setState(res.state);
      if (res.connectedNumber) setConnectedNumber(res.connectedNumber);

      if (res.state === "open") {
        stopPolling();
        setQr(null);
        setStatusMsg("WhatsApp connected.");
      }
    }, POLL_INTERVAL_MS);
  }

  // ------------------------------------------------------------------
  // Connect
  // ------------------------------------------------------------------
  function handleConnect() {
    setError(null);
    setStatusMsg(null);
    startConnect(async () => {
      const res = await connectWhatsapp();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState(res.state);
      setQr(res.qr ?? null);
      startPolling();
    });
  }

  // ------------------------------------------------------------------
  // Disconnect
  // ------------------------------------------------------------------
  function handleDisconnect() {
    setError(null);
    setStatusMsg(null);
    stopPolling();
    startDisconnect(async () => {
      await disconnectWhatsapp();
      setState("close");
      setQr(null);
      setConnectedNumber(null);
      setStatusMsg("WhatsApp disconnected.");
    });
  }

  // ------------------------------------------------------------------
  // Master toggle
  // ------------------------------------------------------------------
  function handleToggle(enabled: boolean) {
    setError(null);
    startToggle(async () => {
      await setWhatsappMasterToggle(enabled);
      setNotificationsEnabled(enabled);
    });
  }

  // ------------------------------------------------------------------
  // Styles
  // ------------------------------------------------------------------
  const inputBase =
    "w-full min-h-[48px] rounded-[4px] border-2 px-3 py-2 text-sm bg-white outline-none transition-colors duration-150 focus:border-[#0080ff]";
  const borderStyle = { borderColor: `${BRAND.ink}22`, backgroundColor: "#FAFAFA" };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <section
      className="rounded-[4px] border-2 p-5 space-y-5"
      style={borderStyle}
      aria-labelledby="wa-panel-heading"
    >
      {/* Header */}
      <div>
        <h2
          id="wa-panel-heading"
          className="font-[var(--font-heading)] text-lg flex items-center gap-2"
          style={{ color: BRAND.ink }}
        >
          {state === "open" ? (
            <Wifi size={20} style={{ color: BRAND.green }} />
          ) : (
            <WifiOff size={20} className="text-slate-400" />
          )}
          WhatsApp Notifications
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Connect a WhatsApp number via QR scan to send automated order
          notifications to customers. Manage message templates in the{" "}
          <a
            href="/admin/notifications"
            className="underline font-medium"
            style={{ color: BRAND.blue }}
          >
            Notification Center
          </a>
          .
        </p>
      </div>

      {/* Connection status badge */}
      {state === "open" && (
        <div
          className="flex items-center gap-2 rounded-[4px] px-3 py-2 text-sm font-semibold"
          style={{ backgroundColor: `${BRAND.green}22`, color: BRAND.ink }}
          role="status"
        >
          <CheckCircle2 size={16} style={{ color: BRAND.green }} />
          Connected
          {connectedNumber ? ` as +${connectedNumber}` : ""}
        </div>
      )}

      {state === "connecting" && !qr && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          Connecting — waiting for QR…
        </div>
      )}

      {/* QR code display */}
      {qr && state !== "open" && (
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: BRAND.ink }}>
            Scan with WhatsApp to connect:
          </p>
          <div className="inline-block rounded-[4px] border-2 p-3 bg-white" style={{ borderColor: `${BRAND.ink}22` }}>
            {qr.startsWith("data:") ? (
              // Evolution returned a base64 PNG data-URI — render directly
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="WhatsApp QR code" width={256} height={256} />
            ) : (
              <QRCodeCanvas value={qr} size={256} />
            )}
          </div>
          <p className="text-xs text-slate-500">
            QR expires in ~40 seconds. It refreshes automatically.
          </p>
          <button
            type="button"
            onClick={async () => {
              const res = await refreshWhatsappQr();
              if (res.ok && res.qr) setQr(res.qr);
            }}
            className="flex items-center gap-1.5 text-xs underline"
            style={{ color: BRAND.blue }}
          >
            <RefreshCw size={12} />
            Refresh QR now
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {state === "close" && (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="min-h-[48px] rounded-[4px] px-6 py-2 font-bold text-white text-sm disabled:opacity-50 transition-colors duration-150 flex items-center gap-2"
            style={{ backgroundColor: BRAND.ink }}
          >
            {connecting && <Loader2 size={16} className="animate-spin" />}
            {connecting ? "Connecting…" : "Connect WhatsApp (QR)"}
          </button>
        )}

        {(state === "connecting" || state === "open") && (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="min-h-[48px] rounded-[4px] border-2 px-6 py-2 font-bold text-sm disabled:opacity-50 transition-colors duration-150 flex items-center gap-2"
            style={{ borderColor: "#ef4444", color: "#ef4444" }}
          >
            {disconnecting && <Loader2 size={16} className="animate-spin" />}
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        )}

        {state === "connecting" && (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="min-h-[48px] rounded-[4px] border-2 px-4 py-2 font-semibold text-sm disabled:opacity-50 transition-colors duration-150 flex items-center gap-2"
            style={{ borderColor: `${BRAND.ink}55`, color: BRAND.ink }}
          >
            <RefreshCw size={14} />
            Retry connect
          </button>
        )}
      </div>

      {/* Master notifications toggle */}
      <div className="pt-3 border-t" style={{ borderColor: `${BRAND.ink}11` }}>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={notificationsEnabled}
              disabled={toggling}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            <div
              className="w-10 h-6 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: notificationsEnabled ? BRAND.green : `${BRAND.ink}33`,
              }}
            />
            <div
              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
              style={{
                transform: notificationsEnabled
                  ? "translateX(16px)"
                  : "translateX(0)",
              }}
            />
          </div>
          <span className="text-sm font-semibold" style={{ color: BRAND.ink }}>
            Enable WhatsApp notifications
          </span>
          {toggling && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </label>
        <p className="text-xs text-slate-500 mt-1 ml-[52px]">
          Master switch — when off, no messages are sent regardless of per-event
          settings.
        </p>
      </div>

      {/* Feedback */}
      {error && (
        <p
          role="alert"
          className="rounded-[4px] px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      )}
      {statusMsg && !error && (
        <p
          role="status"
          className="rounded-[4px] px-3 py-2 text-sm font-semibold flex items-center gap-2"
          style={{ backgroundColor: `${BRAND.green}22`, color: BRAND.ink }}
        >
          <CheckCircle2 size={16} style={{ color: BRAND.green }} />
          {statusMsg}
        </p>
      )}
    </section>
  );
}
