import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { SiteNav } from "@/components/store/site-nav";
import { SiteFooter } from "@/components/store/site-footer";
import { CartDrawer } from "@/components/store/cart-drawer";
import { FontFaceLoader } from "@/components/store/font-face-loader";
import {
  PartnerBanner,
  type PartnerBannerVariant,
} from "@/components/store/partner-banner";
import { getActiveCategoryTree } from "@/lib/catalog";
import { isChristmasSeason } from "@/lib/seasonal";
import HomePage from "@/app/(store)/page";

/**
 * /demo, /demo/1, /demo/2, /demo/3: the real home page, unchanged, with the
 * partner banner on top. Not linked from anywhere and not indexed. The live
 * home page (/) is untouched until one banner is approved.
 */

export const metadata: Metadata = {
  title: "Home page demo",
  robots: { index: false, follow: false },
};

const DEMOS: { n: string; variant: PartnerBannerVariant; label: string }[] = [
  { n: "1", variant: "black", label: "Black" },
  { n: "2", variant: "light", label: "Light" },
  { n: "3", variant: "green", label: "Green" },
];

export default async function HomeDemoPage({
  params,
}: {
  params: Promise<{ n?: string[] }>;
}) {
  const { n } = await params;
  if (n && n.length > 1) notFound();
  const demo = DEMOS.find((d) => d.n === (n?.[0] ?? "1"));
  if (!demo) notFound();

  const categoryTree = await getActiveCategoryTree().catch(() => []);

  return (
    <div
      style={{ backgroundColor: "#FFFFFF", color: BRAND.ink }}
      className="min-h-screen flex flex-col"
    >
      <FontFaceLoader />
      <PartnerBanner variant={demo.variant} />
      <SiteNav categoryTree={categoryTree} showChristmas={isChristmasSeason()} />
      <main className="flex-1 overflow-x-clip">
        <HomePage />
      </main>
      <SiteFooter />
      <CartDrawer />

      {/* Demo-only switcher. Not part of the design. */}
      <nav
        aria-label="Demo templates"
        className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-300 bg-white p-1 shadow-lg"
      >
        {DEMOS.map((d) => {
          const on = d.n === demo.n;
          return (
            <Link
              key={d.n}
              href={`/demo/${d.n}`}
              aria-current={on ? "page" : undefined}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 text-sm font-bold"
              style={
                on
                  ? { backgroundColor: BRAND.ink, color: "#FFFFFF" }
                  : { color: BRAND.ink }
              }
            >
              {d.n}. {d.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
