/**
 * Admin guide content loader.
 *
 * Reads markdown files from src/content/admin-guide/ and parses their
 * front matter. All operations are synchronous (Node fs) so they can run
 * inside Next.js Server Components without any async overhead.
 *
 * Front matter shape:
 *   title: string
 *   category: string
 *   tags: string[]
 *   order: number
 */

import fs from "fs";
import path from "path";

export type GuideArticle = {
  slug: string; // e.g. "products/add-product"
  title: string;
  category: string;
  tags: string[];
  order: number;
  content: string; // raw markdown body (front matter stripped)
  href: string; // e.g. "/admin/guide/products/add-product"
};

const CONTENT_DIR = path.join(process.cwd(), "src", "content", "admin-guide");

/**
 * Parse the YAML-ish front matter from a markdown file.
 * Only handles the simple key: value and key: [a, b] shapes we use.
 * Full YAML parser not needed — keeping deps lean.
 */
function parseFrontMatter(raw: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf("---", 3);
  if (end === -1) return { meta: {}, body: raw };

  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 3).trim();
  const meta: Record<string, unknown> = {};

  for (const line of fm.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();

    if (val.startsWith("[")) {
      // Array: [a, b, c]
      meta[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else if (val === "true") {
      meta[key] = true;
    } else if (val === "false") {
      meta[key] = false;
    } else if (!isNaN(Number(val)) && val !== "") {
      meta[key] = Number(val);
    } else {
      meta[key] = val.replace(/^['"]|['"]$/g, "");
    }
  }

  return { meta, body };
}

/**
 * Walk a directory tree and collect all .md file paths relative to CONTENT_DIR.
 */
function walkMd(dir: string, base = ""): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...walkMd(path.join(dir, entry.name), rel));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      result.push(rel);
    }
  }
  return result;
}

function fileToSlug(relPath: string): string {
  return relPath.replace(/\.md$/, "");
}

let _cache: GuideArticle[] | null = null;

export function getAllGuideArticles(): GuideArticle[] {
  if (_cache) return _cache;

  const files = walkMd(CONTENT_DIR);
  const articles: GuideArticle[] = [];

  for (const relPath of files) {
    const absPath = path.join(CONTENT_DIR, relPath);
    const raw = fs.readFileSync(absPath, "utf-8");
    const { meta, body } = parseFrontMatter(raw);

    const slug = fileToSlug(relPath);
    articles.push({
      slug,
      title: (meta.title as string) ?? slug,
      category: (meta.category as string) ?? "General",
      tags: (meta.tags as string[]) ?? [],
      order: typeof meta.order === "number" ? meta.order : 99,
      content: body,
      href: `/admin/guide/${slug}`,
    });
  }

  // Sort by category then order
  articles.sort((a, b) => {
    if (a.category !== b.category)
      return a.category.localeCompare(b.category);
    return a.order - b.order;
  });

  _cache = articles;
  return articles;
}

export function getGuideArticleBySlug(
  slug: string
): GuideArticle | undefined {
  return getAllGuideArticles().find((a) => a.slug === slug);
}

export function getGuideCategories(): string[] {
  const cats = new Set<string>();
  for (const a of getAllGuideArticles()) cats.add(a.category);
  return Array.from(cats).sort();
}

export function searchGuideArticles(query: string): GuideArticle[] {
  if (!query.trim()) return getAllGuideArticles();
  const q = query.toLowerCase();
  return getAllGuideArticles().filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q)) ||
      a.content.toLowerCase().includes(q)
  );
}
