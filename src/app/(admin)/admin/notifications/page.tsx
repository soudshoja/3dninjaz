import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { listWhatsappNotifications } from "@/actions/admin-whatsapp-notifications";
import { getWhatsappAdminState } from "@/actions/admin-whatsapp";
import { WhatsappNotificationsEditor } from "@/components/admin/whatsapp-notifications-editor";
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";

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
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Notification Center
          </h1>
          <p className="mt-1 text-slate-600">
            Manage WhatsApp message templates for automated order notifications.
            Enable or disable individual events and customise the message sent to
            customers.
          </p>
        </header>

        {/* Connection status banner */}
        {!isConnected ? (
          <div
            className="flex items-start gap-3 rounded-[4px] border-2 px-4 py-3 mb-6 text-sm"
            style={{ borderColor: "#f59e0b44", backgroundColor: "#fffbeb" }}
          >
            <AlertTriangle
              size={18}
              className="shrink-0 mt-0.5"
              style={{ color: "#d97706" }}
            />
            <div>
              <p className="font-semibold" style={{ color: "#92400e" }}>
                WhatsApp is not connected
              </p>
              <p className="text-slate-600 mt-0.5">
                Templates are saved but messages will not be sent until a
                WhatsApp number is connected.{" "}
                <Link
                  href="/admin/settings"
                  className="underline font-medium"
                  style={{ color: BRAND.blue }}
                >
                  Connect on the Settings page
                </Link>
                .
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex items-center gap-3 rounded-[4px] border-2 px-4 py-3 mb-6 text-sm"
            style={{ borderColor: `${BRAND.green}44`, backgroundColor: `${BRAND.green}11` }}
          >
            <Wifi size={18} className="shrink-0" style={{ color: BRAND.green }} />
            <div>
              <p className="font-semibold" style={{ color: BRAND.ink }}>
                WhatsApp connected
                {whatsapp.connectedNumber
                  ? ` (+${whatsapp.connectedNumber})`
                  : ""}
              </p>
              {!notificationsEnabled && (
                <p className="text-slate-600 mt-0.5">
                  The master notifications toggle is{" "}
                  <span className="font-semibold text-orange-600">off</span>.
                  Enable it on the{" "}
                  <Link
                    href="/admin/settings"
                    className="underline"
                    style={{ color: BRAND.blue }}
                  >
                    Settings page
                  </Link>{" "}
                  to activate sending.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Connection status indicator row */}
        <div className="flex items-center gap-2 mb-4">
          {isConnected ? (
            <Wifi size={14} style={{ color: BRAND.green }} />
          ) : (
            <WifiOff size={14} className="text-slate-400" />
          )}
          <span className="text-xs text-slate-500">
            {isConnected
              ? `Connected${notificationsEnabled ? " · Notifications enabled" : " · Notifications disabled"}`
              : "Not connected"}
          </span>
          <span className="text-xs text-slate-400 ml-auto">
            {rows.length} event{rows.length !== 1 ? "s" : ""} configured
          </span>
        </div>

        {/* Event cards */}
        <WhatsappNotificationsEditor rows={rows} />

        {/* Footer hint */}
        <p className="mt-6 text-xs text-slate-400 text-center">
          Changes take effect immediately. The master toggle and WhatsApp
          connection are managed on the{" "}
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
