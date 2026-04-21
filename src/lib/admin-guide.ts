/**
 * Admin guide content loader.
 *
 * Article data is pre-generated at build time by scripts/build-admin-guide.mjs
 * into src/lib/admin-guide-generated.ts. This module re-exports helpers that
 * read from that static data — zero runtime fs access, works in Next.js
 * standalone output regardless of deployment topology.
 *
 * To regenerate after editing markdown files, run:
 *   node scripts/build-admin-guide.mjs
 * or just `npm run build` (it runs the codegen automatically via the build script).
 */

export type GuideArticle = {
  slug: string; // e.g. "products/add-product"
  title: string;
  category: string;
  tags: string[];
  order: number;
  content: string; // raw markdown body (front matter stripped)
  href: string; // e.g. "/admin/guide/products/add-product"
};

// Loaded from the pre-generated module — populated by scripts/build-admin-guide.mjs
import { GUIDE_ARTICLES } from "./admin-guide-generated";

export function getAllGuideArticles(): GuideArticle[] {
  return GUIDE_ARTICLES;
}

export function getGuideArticleBySlug(
  slug: string
): GuideArticle | undefined {
  return GUIDE_ARTICLES.find((a) => a.slug === slug);
}

export function getGuideCategories(): string[] {
  const cats = new Set<string>();
  for (const a of GUIDE_ARTICLES) cats.add(a.category);
  return Array.from(cats).sort();
}

export function searchGuideArticles(query: string): GuideArticle[] {
  if (!query.trim()) return GUIDE_ARTICLES;
  const q = query.toLowerCase();
  return GUIDE_ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q)) ||
      a.content.toLowerCase().includes(q)
  );
}
