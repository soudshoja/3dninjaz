import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { SiteNav } from "@/components/store/site-nav";
import { SiteFooter } from "@/components/store/site-footer";
import { CartDrawer } from "@/components/store/cart-drawer";
import { FontFaceLoader } from "@/components/store/font-face-loader";
import { PartnerBanner } from "@/components/store/partner-banner";
import { getActiveCategoryTree } from "@/lib/catalog";
import { isChristmasSeason } from "@/lib/seasonal";
import HomePage from "@/app/(store)/page";

/**
 * /demo: the real home page, unchanged, with the partner banner on top.
 * Not linked from anywhere and not indexed. The live home page (/) is
 * untouched until the banner is approved.
 */

export const metadata: Metadata = {
  title: "Home page demo",
  robots: { index: false, follow: false },
};

export default async function HomeDemoPage() {
  const categoryTree = await getActiveCategoryTree().catch(() => []);

  return (
    <div
      style={{ backgroundColor: "#FFFFFF", color: BRAND.ink }}
      className="min-h-screen flex flex-col"
    >
      <FontFaceLoader />
      <PartnerBanner />
      <SiteNav categoryTree={categoryTree} showChristmas={isChristmasSeason()} />
      <main className="flex-1 overflow-x-clip">
        <HomePage />
      </main>
      <SiteFooter />
      <CartDrawer />
    </div>
  );
}
