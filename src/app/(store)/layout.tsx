import type { ReactNode } from "react";
import { SiteNav } from "@/components/store/site-nav";
import { SiteFooter } from "@/components/store/site-footer";
import { CartDrawer } from "@/components/store/cart-drawer";
import { BRAND } from "@/lib/brand";
import { getActiveCategoryTree } from "@/lib/catalog";
import { FontFaceLoader } from "@/components/store/font-face-loader";

/**
 * Customer-facing route-group layout. Lightened (2026-04-20): mostly-white
 * storefront base, ink text. Accent colors (blue/green/purple) used as
 * per-component pops, not as full-section fills. Admin retains its own
 * chrome — this surface change does not propagate across route groups.
 * Phase 8: loads the category tree once here and passes it to the client
 * SiteNav so every page renders the mega-menu without a per-page round-trip.
 *
 * Failure-isolation: if the tree fetch throws (cold DB, pool blip) we
 * fall back to an empty list so the layout still renders — the nav
 * simply shows "Shop" without the dropdown, which is survivable UX.
 */
export default async function StoreLayout({ children }: { children: ReactNode }) {
  let categoryTree: Awaited<ReturnType<typeof getActiveCategoryTree>> = [];
  try {
    categoryTree = await getActiveCategoryTree();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[layout] category tree fetch failed:", err);
  }

  return (
    <div
      style={{ backgroundColor: "#FFFFFF", color: BRAND.ink }}
      className="min-h-screen flex flex-col"
    >
      <FontFaceLoader />
      <SiteNav categoryTree={categoryTree} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CartDrawer />
    </div>
  );
}
