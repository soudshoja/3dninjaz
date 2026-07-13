import type { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";
import { SITE } from "@/lib/site-metadata";
import { getActiveProducts, getActiveCategories } from "@/lib/catalog";
import { getTenantContext } from "@/lib/tenant/context";
import { publicOrigin } from "@/lib/public-url";
import type { Tenant } from "@/lib/tenant/platform-schema";

/**
 * /sitemap.xml via Next.js 15 Metadata API (file-based convention).
 *
 * force-dynamic (Phase 24 24-04): the catalog reads below resolve tenant
 * identity via headers(), so this route genuinely varies per-request once
 * the singleton sweep lands — it can no longer be statically prerendered.
 *
 * Base URL resolves per-tenant (B1/SC5 — see resolveBaseUrl below):
 * registry-mode tenants get their registry primaryDomain; the synthesized
 * "single" tenant keeps today's NEXT_PUBLIC_SITE_URL ?? SITE.url chain
 * verbatim (byte-identical in single mode).
 *
 * Only emits ACTIVE products (getActiveProducts filters isActive=true) so
 * draft / inactive products never leak into the crawl surface (T-04-04-02).
 *
 * Also emits category landing pages (/shop?category=<slug>) if categories
 * exist — these are the same route as /shop with a query string, but giving
 * each category its own sitemap entry lets Google discover them directly.
 *
 * If the DB is unreachable at render time (network blip, Passenger cold
 * start hitting the pool before it warms) we fall back to STATIC ROUTES
 * ONLY. A failing DB must not 500 the sitemap — crawlers will retry. A
 * build-time DynamicServerError (framework control flow, NOT a DB blip) is
 * re-thrown via unstable_rethrow BEFORE that fallback so Next renders this
 * route dynamically instead of baking a product-less static sitemap (B1).
 */

export const dynamic = "force-dynamic";

function resolveBaseUrl(tenant?: Tenant): string {
  if (tenant && tenant.id !== "single") {
    return publicOrigin(tenant).replace(/\/$/, "");
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env && env.length > 0) {
    // Strip trailing slash to keep URL concatenation consistent.
    return env.replace(/\/$/, "");
  }
  return SITE.url;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { tenant } = await getTenantContext();
  const base = resolveBaseUrl(tenant);
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${base}/shop`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  let productRoutes: MetadataRoute.Sitemap = [];
  let categoryRoutes: MetadataRoute.Sitemap = [];

  try {
    const [products, categories] = await Promise.all([
      getActiveProducts(),
      getActiveCategories(),
    ]);

    productRoutes = products.map((p) => ({
      url: `${base}/products/${p.slug}`,
      lastModified: p.updatedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

    categoryRoutes = categories.map((c) => ({
      // Category schema only exposes createdAt (no updatedAt column);
      // fall back to now() when the row predates the column or category
      // seed data has not been refreshed since the last deploy.
      url: `${base}/shop?category=${encodeURIComponent(c.slug)}`,
      lastModified: c.createdAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    // Re-throw framework control-flow errors (e.g. a build-time
    // DynamicServerError) — a bare catch here would otherwise swallow it and
    // bake a product-less sitemap at build time (B1). No-op for real errors.
    unstable_rethrow(err);
    // Non-fatal: emit static routes only and log for diagnostics. Crawlers
    // will refetch the sitemap on their normal cadence; stale product data
    // for one cycle is acceptable and preferable to a 500.
    // eslint-disable-next-line no-console
    console.warn("[sitemap] DB fetch failed, emitting static routes only:", err);
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
