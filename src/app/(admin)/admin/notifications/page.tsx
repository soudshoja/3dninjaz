import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { listWhatsappNotifications } from "@/actions/admin-whatsapp-notifications";
import { getWhatsappAdminState } from "@/actions/admin-whatsapp";
import { WhatsappNotificationsEditor } from "@/components/admin/whatsapp-notifications-editor";
import { Wifi, WifiOff, AlertTriangle, Bell, Settings } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Notification Center",
  robots: { index: false, follow: false },
};

export default async function AdminNotificationsPage() {
  await requireAdmin();

  const [rows, whatsapp] = await Promise.all([
    listWhatsappNotifications(),
    getWhatsappAdminState(),
  ]);

  const isConnected = whatsapp.connectionState === "open";
  const notificationsEnabled = whatsapp.notificationsEnabled;

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">

        {/* ── Page header ── */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg"
              style={{ backgroundColor: BRAND.ink }}
            >
              <Bell size={22} className="text-white" />
            </div>
            <div>
              <h1
                className="font-[var(--font-heading)] text-3xl md:text-4xl font-extrabold tracking-tight"
                style={{ color: BRAND.ink }}
              >
                Notification Center
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                WhatsApp message templates for automated order notifications
              </p>
            </div>
          </div>
        </header>

        {/* ── Status card ── */}
        <div
          className="rounded-3xl border-2 p-5 md:p-6 mb-8 shadow-[0_4px_24px_0_rgba(11,16,32,0.08)]"
          style={{
            borderColor: isConnected ? `${BRAND.green}55` : "#f59e0b55",
            backgroundColor: isConnected ? `${BRAND.green}0f` : "#fffbeb",
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Status icon + label */}
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-md flex-shrink-0"
                style={{
                  backgroundColor: isConnected ? `${BRAND.green}22` : "#fef3c7",
                  border: `2px solid ${isConnected ? `${BRAND.green}44` : "#fcd34d"}`,
                }}
              >
                {isConnected ? (
                  <Wifi size={22} style={{ color: BRAND.green }} />
                ) : (
                  <WifiOff size={22} style={{ color: "#d97706" }} />
                )}
              </div>
              <div>
                <p
                  className="font-bold text-base"
                  style={{ color: BRAND.ink }}
                >
                  {isConnected
                    ? `WhatsApp connected${whatsapp.connectedNumber ? ` (+${whatsapp.connectedNumber})` : ""}`
                    : "WhatsApp not connected"}
                </p>
                <p className="text-sm text-slate-500">
                  {isConnected
                    ? notificationsEnabled
                      ? "Notifications are active — messages will be sent."
                      : "Master toggle is off — no messages will be sent."
                    : "Connect a number to enable message delivery."}
                </p>
              </div>
            </div>

            {/* CTA to settings */}
            <Link
              href="/admin/settings"
              className="sm:ml-auto flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold border-2 transition-colors duration-150 hover:opacity-80 flex-shrink-0"
              style={{
                borderColor: `${BRAND.ink}22`,
                backgroundColor: "#ffffff",
                color: BRAND.ink,
              }}
            >
              <Settings size={15} />
              {isConnected ? "Manage connection" : "Connect WhatsApp"}
            </Link>
          </div>

          {/* Warning banner — not connected */}
          {!isConnected && (
            <div
              className="mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm"
              style={{ backgroundColor: "#fef3c7", border: "1.5px solid #fcd34d" }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#d97706" }} />
              <p style={{ color: "#92400e" }}>
                Templates are saved and can be edited, but messages will not be
                sent until a WhatsApp number is connected.
              </p>
            </div>
          )}

          {/* Warning banner — notifications disabled */}
          {isConnected && !notificationsEnabled && (
            <div
              className="mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm"
              style={{ backgroundColor: "#fef3c7", border: "1.5px solid #fcd34d" }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#d97706" }} />
              <p style={{ color: "#92400e" }}>
                WhatsApp is connected but the master notifications toggle is{" "}
                <strong>off</strong>. Enable it in Settings to start sending
                messages.
              </p>
            </div>
          )}
        </div>

        {/* ── Event cards ── */}
        <WhatsappNotificationsEditor rows={rows} />

        {/* ── Footer ── */}
        <p className="mt-8 text-xs text-slate-400 text-center">
          Changes take effect immediately. Master toggle and WhatsApp connection
          are managed on the{" "}
          <Link
            href="/admin/settings"
            className="underline"
            style={{ color: BRAND.blue }}
          >
            Settings page
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
