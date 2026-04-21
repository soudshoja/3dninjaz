import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  getAllGuideArticles,
  getGuideArticleBySlug,
} from "@/lib/admin-guide";
import { GuideArticle } from "@/components/admin/guide/guide-article";
import { BRAND } from "@/lib/brand";

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const slugStr = slug.join("/");
  const article = getGuideArticleBySlug(slugStr);
  return {
    title: article
      ? `Admin Guide · ${article.title}`
      : "Admin Guide",
    robots: { index: false, follow: false },
  };
}

export function generateStaticParams() {
  const articles = getAllGuideArticles();
  return articles.map((a) => ({
    slug: a.slug.split("/"),
  }));
}

/**
 * /admin/guide/[...slug] — catch-all route for individual guide articles.
 *
 * slug is an array of path segments: ["products", "add-product"] maps to
 * the file products/add-product.md in src/content/admin-guide/.
 */
export default async function AdminGuideArticlePage({ params }: PageProps) {
  await requireAdmin();
  const { slug } = await params;
  const slugStr = slug.join("/");

  // Redirect launch to its dedicated interactive page (handled by sibling route)
  // This catch-all won't match "launch" because Next.js matches the more specific
  // /admin/guide/launch route first.

  const article = getGuideArticleBySlug(slugStr);
  if (!article) notFound();

  // Get all articles in the same category for "In this section" nav
  const allArticles = getAllGuideArticles();
  const sectionArticles = allArticles.filter(
    (a) => a.category === article.category && a.slug !== article.slug
  );

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex gap-8">
          {/* Section sidebar */}
          {sectionArticles.length > 0 && (
            <aside className="hidden md:block w-52 shrink-0">
              <div
                className="sticky top-8 rounded-xl border p-4"
                style={{ borderColor: `${BRAND.ink}15`, backgroundColor: "#fafafa" }}
              >
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  {article.category}
                </p>
                <nav className="flex flex-col gap-1">
                  <Link
                    href={article.href}
                    className="text-sm font-semibold truncate py-1 px-2 rounded-md"
                    style={{
                      backgroundColor: `${BRAND.blue}18`,
                      color: BRAND.blue,
                    }}
                    aria-current="page"
                  >
                    {article.title}
                  </Link>
                  {sectionArticles.map((a) => (
                    <Link
                      key={a.slug}
                      href={a.href}
                      className="text-sm text-slate-600 hover:text-slate-900 truncate py-1 px-2 rounded-md hover:bg-slate-100 transition-colors"
                    >
                      {a.title}
                    </Link>
                  ))}
                </nav>
              </div>
            </aside>
          )}

          {/* Article */}
          <div className="flex-1 min-w-0">
            <GuideArticle
              title={article.title}
              category={article.category}
              content={article.content}
            />

            {/* Prev / Next navigation */}
            <PrevNextNav articles={allArticles} current={article.slug} />
          </div>
        </div>
      </div>
    </main>
  );
}

function PrevNextNav({
  articles,
  current,
}: {
  articles: ReturnType<typeof getAllGuideArticles>;
  current: string;
}) {
  const idx = articles.findIndex((a) => a.slug === current);
  const prev = idx > 0 ? articles[idx - 1] : null;
  const next = idx < articles.length - 1 ? articles[idx + 1] : null;

  if (!prev && !next) return null;

  return (
    <nav
      className="mt-10 flex items-center justify-between gap-4 pt-6"
      style={{ borderTop: `1px solid ${BRAND.ink}15` }}
      aria-label="Article navigation"
    >
      <div className="flex-1">
        {prev && (
          <Link
            href={prev.href}
            className="group flex flex-col text-sm text-slate-600 hover:text-slate-900"
          >
            <span className="text-xs text-slate-400 mb-0.5">← Previous</span>
            <span className="font-semibold group-hover:underline">
              {prev.title}
            </span>
          </Link>
        )}
      </div>
      <div className="flex-1 text-right">
        {next && (
          <Link
            href={next.href}
            className="group flex flex-col items-end text-sm text-slate-600 hover:text-slate-900"
          >
            <span className="text-xs text-slate-400 mb-0.5">Next →</span>
            <span className="font-semibold group-hover:underline">
              {next.title}
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
