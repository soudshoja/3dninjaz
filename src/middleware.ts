import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 7 (07-09) — maintenance-mode middleware.
 *
 * Reads MAINTENANCE_MODE env on the hot path. When truthy, redirects all
 * non-allowlisted routes to /maintenance. Allowlist:
 *   - /admin/**            — admin can still log in to flip the flag back
 *   - /api/paypal/webhook  — payments must keep capturing during maintenance
 *   - /api/webhooks/delyva — Delyva tracking webhooks must keep firing so
 *                            shipments don't stall + delivered emails fire
 *   - /api/health*         — uptime checks
 *   - /api/events/track    — admin analytics keep flowing
 *   - /payment-links/**    — customers paying for manual orders shouldn't be blocked
 *   - /maintenance         — avoid redirect loop
 *   - /_next/**, /uploads/**, /favicon — static assets
 *
 * Q-07-05 default: env-only toggle (no DB switch).
 */

const ALLOWLIST_PREFIXES = [
  "/admin",
  "/api/paypal/webhook",
  "/api/webhooks/delyva",
  "/api/health",
  "/api/events/track",
  "/payment-links",
  "/maintenance",
  "/_next",
  "/uploads",
  "/favicon",
] as const;

function isMaintenanceOn(): boolean {
  const v = (process.env.MAINTENANCE_MODE ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function isAllowed(pathname: string): boolean {
  for (const p of ALLOWLIST_PREFIXES) {
    if (pathname === p) return true;
    if (pathname.startsWith(p + "/")) return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  if (!isMaintenanceOn()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (isAllowed(pathname)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/maintenance";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
