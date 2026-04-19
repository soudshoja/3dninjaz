import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site-metadata";

/**
 * /robots.txt via Next.js 15 Metadata API (file-based convention).
 *
 * Policy per Plan 04-04 scope:
 *   Allowed (explicit):  /, /shop, /products/, /about, /contact, /privacy, /terms
 *   Disallowed:
 *     - /admin/*               (admin surface — session-gated but never index)
 *     - /api/*                 (server endpoints — never index)
 *     - /bag                   (transient per-user cart state)
 *     - /checkout              (transient per-user flow; contains intent data)
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
 */
export default function robots(): MetadataRoute.Robots {
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
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
