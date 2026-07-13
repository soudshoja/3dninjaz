import { SITE } from "@/lib/site-metadata";
import type { Tenant } from "@/lib/tenant/platform-schema";

/**
 * Canonical public origin for customer-facing links (emails, WhatsApp,
 * payment links, sitemap). Env-driven so dev (app.3dninjaz.com) and prod
 * (3dninjaz.com) builds each link to their own origin; falls back to the
 * canonical prod domain in SITE.url.
 *
 * Phase 24 (24-01): accepts an optional tenant. In TENANT_MODE=registry, a
 * non-"single" tenant's origin is derived from its registry
 * `primaryDomain` — NEVER from the incoming Host header (Pitfall 4:
 * ProxyPreserveHost forwards a spoofable Host; deriving outbound links from
 * it enables reset-link poisoning). Callers with no tenant arg, or running
 * under single mode, get today's exact env-driven behavior — byte-identical.
 */
export function publicOrigin(tenant?: Tenant): string {
  if (tenant && process.env.TENANT_MODE === "registry" && tenant.id !== "single") {
    return `https://${tenant.primaryDomain}`;
  }
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    SITE.url;
  return raw.trim().replace(/\/+$/, "");
}

export function publicUrl(path: string, tenant?: Tenant): string {
  return `${publicOrigin(tenant)}${path.startsWith("/") ? "" : "/"}${path}`;
}
