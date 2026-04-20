import type { ReactNode } from "react";
import { SiteNav } from "@/components/store/site-nav";
import { SiteFooter } from "@/components/store/site-footer";
import { CartDrawer } from "@/components/store/cart-drawer";
import { BRAND } from "@/lib/brand";
import { getActiveCategoryTree } from "@/lib/catalog";

/**
 * Customer-facing route-group layout. Cream background, ink text,
 * unified SiteNav + SiteFooter. Phase 8: loads the category tree once
 * here and passes it to the client SiteNav so every page renders the
 * mega-menu without a per-page round-trip.
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
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
      className="min-h-screen flex flex-col"
    >
      <SiteNav categoryTree={categoryTree} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CartDrawer />
    </div>
  );
}
