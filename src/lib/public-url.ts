import { SITE } from "@/lib/site-metadata";

/**
 * Canonical public origin for customer-facing links (emails, WhatsApp,
 * payment links, sitemap). Env-driven so dev (app.3dninjaz.com) and prod
 * (3dninjaz.com) builds each link to their own origin; falls back to the
 * canonical prod domain in SITE.url.
 */
export function publicOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    SITE.url;
  return raw.trim().replace(/\/+$/, "");
}

export function publicUrl(path: string): string {
  return `${publicOrigin()}${path.startsWith("/") ? "" : "/"}${path}`;
}
