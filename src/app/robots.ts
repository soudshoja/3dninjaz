import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site-metadata";
import { getTenantContext } from "@/lib/tenant/context";
import { publicOrigin } from "@/lib/public-url";
import type { Tenant } from "@/lib/tenant/platform-schema";

/**
 * /robots.txt via Next.js 15 Metadata API (file-based convention).
 *
 * Policy per Plan 04-04 scope:
 *   Allowed (explicit):  /, /shop, /products/, /about, /contact, /privacy, /terms
 *   Disallowed:
 *     - /admin/*               (admin surface — session-gated but never index)
 *     - /api/*                 (server endpoints — never index)
 *     - /bag                   (transient per-user cart state)
 *     - /checkout               (transient per-user flow; contains intent data)
 *     - /orders, /orders/*     (per-user order data; auth-gated)
 *     - /login, /register      (auth forms — no SEO value)
 *     - /forgot-password       (auth form)
 *     - /reset-password        (one-time token URL — never index)
 *
 * `host` canonicalises the preferred domain for crawlers that honour it.
 * `sitemap` points crawlers at the programmatic sitemap.ts route.
 *
 * Access control is enforced at the route handler / layout level (Phase 1
 * auth gates + Phase 4 Plan 04-03 page-level `robots: noindex` exports).
 * robots.txt is a crawler hint, never a security boundary (T-04-04-01).
 *
 * force-dynamic (Phase 24 24-04, SC5/B1): sitemap/host are now tenant-
 * derived so a registry-mode tenant's robots.txt never advertises another
 * tenant's host/sitemap. No try/catch here — a build-time DynamicServerError
 * propagates naturally (no unstable_rethrow needed). Byte-identical in
 * single mode (resolveBaseUrl keeps today's SITE.url for the synthesized
 * "single" tenant).
 */

export const dynamic = "force-dynamic";

function resolveBaseUrl(tenant?: Tenant): string {
  if (tenant && tenant.id !== "single") {
    return publicOrigin(tenant).replace(/\/$/, "");
  }
  return SITE.url;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { tenant } = await getTenantContext();
  const base = resolveBaseUrl(tenant);

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/shop",
          "/products/",
          "/about",
          "/contact",
          "/privacy",
          "/terms",
        ],
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/bag",
          "/checkout",
          "/orders",
          "/orders/",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/payment-links",
          "/payment-links/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
