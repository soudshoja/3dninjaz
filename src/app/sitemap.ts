import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site-metadata";
import { getActiveProducts, getActiveCategories } from "@/lib/catalog";

/**
 * /sitemap.xml via Next.js 15 Metadata API (file-based convention).
 *
 * Base URL resolves from NEXT_PUBLIC_SITE_URL when set (preview deployments
 * under /v1 may set this to https://3dninjaz.com/v1 so sitemap entries stay
 * self-consistent), otherwise falls back to SITE.url (https://3dninjaz.com).
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
 * ONLY. A failing DB must not 500 the sitemap — crawlers will retry.
 */

function resolveBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env && env.length > 0) {
    // Strip trailing slash to keep URL concatenation consistent.
    return env.replace(/\/$/, "");
  }
  return SITE.url;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = resolveBaseUrl();
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
    // Non-fatal: emit static routes only and log for diagnostics. Crawlers
    // will refetch the sitemap on their normal cadence; stale product data
    // for one cycle is acceptable and preferable to a 500.
    // eslint-disable-next-line no-console
    console.warn("[sitemap] DB fetch failed, emitting static routes only:", err);
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
