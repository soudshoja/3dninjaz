import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  getAllGuideArticles,
  getGuideCategories,
} from "@/lib/admin-guide";
import { GuideSearch } from "@/components/admin/guide/guide-search";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Admin · Guide",
  robots: { index: false, follow: false },
};

const CATEGORY_ICONS: Record<string, string> = {
  Guide: "/icons/ninja/emoji/tip@128.png",
  Products: "/icons/ninja/nav/shop@128.png",
  Shipping: "/icons/ninja/nav/services@128.png",
  Orders: "/icons/ninja/nav/download@128.png",
  Payments: "/icons/ninja/emoji/secure@128.png",
  Customers: "/icons/ninja/nav/about@128.png",
  Marketing: "/icons/ninja/emoji/contact@128.png",
  Content: "/icons/ninja/nav/blog@128.png",
  Operations: "/icons/ninja/nav/services@128.png",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Guide: "Welcome, launch checklist, and how to use this guide",
  Products: "Adding products, variants, sizes, pricing, photos, and cost",
  Shipping: "Flat rates, Delyva couriers, labels, and tracking",
  Orders: "Order lifecycle, manual orders, refunds, disputes",
  Payments: "PayPal, reconciliation, and transaction reporting",
  Customers: "Customer accounts, subscribers, and email communication",
  Marketing: "Email templates, coupons, reviews, and subscribers",
  Content: "About page, contact details, and maintenance mode",
  Operations: "Settings, profit tracking, and backups",
};

export default async function AdminGuidePage() {
  await requireAdmin();
  const articles = getAllGuideArticles();
  const categories = getGuideCategories();

  const searchableArticles = articles.map((a) => ({
    slug: a.slug,
    title: a.title,
    category: a.category,
    tags: a.tags,
    href: a.href,
  }));

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex items-start gap-4">
          <Image
            src="/icons/ninja/emoji/tip@128.png"
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 object-contain shrink-0"
          />
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Admin Guide
            </h1>
            <p className="mt-1 text-slate-600 max-w-xl">
              Everything you need to run 3D Ninjaz — step by step. Search below
              or browse by category.
            </p>
          </div>
        </header>

        {/* Launch checklist CTA */}
        <div
          className="rounded-2xl p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4"
          style={{
            background: `linear-gradient(135deg, ${BRAND.blue}18, ${BRAND.green}18)`,
            border: `1.5px solid ${BRAND.blue}33`,
          }}
        >
          <div className="flex-1">
            <p className="font-[var(--font-heading)] text-lg" style={{ color: BRAND.ink }}>
              Setting up for the first time?
            </p>
            <p className="text-sm text-slate-600 mt-0.5">
              Follow the Launch Checklist — a step-by-step guide from zero to
              first sale, with checkboxes to track your progress.
            </p>
          </div>
          <Link
            href="/admin/guide/launch"
            className="inline-flex items-center rounded-full px-6 py-3 font-bold text-white min-h-[48px] whitespace-nowrap shrink-0"
            style={{ backgroundColor: BRAND.blue }}
          >
            Launch Checklist →
          </Link>
        </div>

        {/* Search */}
        <div className="mb-8">
          <GuideSearch articles={searchableArticles} />
        </div>

        {/* Category tiles */}
        <section>
          <h2
            className="font-[var(--font-heading)] text-xl mb-4"
            style={{ color: BRAND.ink }}
          >
            Browse by category
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const catArticles = articles.filter(
                (a) => a.category === cat
              );
              const icon = CATEGORY_ICONS[cat] ?? "/icons/ninja/emoji/tip@128.png";
              const desc = CATEGORY_DESCRIPTIONS[cat] ?? "";
              // Link to the first article in the category
              const firstHref = catArticles[0]?.href ?? "/admin/guide";

              return (
                <Link
                  key={cat}
                  href={firstHref}
                  className="rounded-2xl bg-white p-5 border hover:border-blue-300 transition-colors group"
                  style={{ borderColor: `${BRAND.ink}15` }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Image
                      src={icon}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 object-contain"
                    />
                    <span
                      className="font-[var(--font-heading)] text-base group-hover:text-blue-700 transition-colors"
                      style={{ color: BRAND.ink }}
                    >
                      {cat}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{desc}</p>
                  <ul className="space-y-1">
                    {catArticles.slice(0, 4).map((a) => (
                      <li key={a.slug}>
                        <span className="text-xs text-slate-600 group-hover:text-slate-700">
                          {a.title}
                        </span>
                      </li>
                    ))}
                    {catArticles.length > 4 && (
                      <li className="text-xs text-slate-400">
                        +{catArticles.length - 4} more
                      </li>
                    )}
                  </ul>
                </Link>
              );
            })}
          </div>
        </section>

        {/* All articles flat list */}
        <section className="mt-10">
          <h2
            className="font-[var(--font-heading)] text-xl mb-4"
            style={{ color: BRAND.ink }}
          >
            All articles
          </h2>
          <div
            className="rounded-2xl bg-white overflow-hidden"
            style={{ border: `1px solid ${BRAND.ink}15` }}
          >
            {articles.map((a, i) => (
              <Link
                key={a.slug}
                href={a.href}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                style={{
                  borderTop: i === 0 ? undefined : `1px solid ${BRAND.ink}0d`,
                }}
              >
                <div>
                  <span className="font-semibold text-sm" style={{ color: BRAND.ink }}>
                    {a.title}
                  </span>
                  <span className="ml-3 text-xs text-slate-400">{a.category}</span>
                </div>
                <span className="text-slate-400 text-sm">→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
