import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
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
    // Re-throw framework control-flow errors (e.g. a build-time
    // DynamicServerError) — a bare catch here would otherwise swallow it and
    // bake an empty nav mega-menu into static pages (/about /contact
    // /privacy /terms) at build time (B1). No-op for real errors, so a
    // genuine pool blip still falls through to the empty-nav fallback below.
    unstable_rethrow(err);
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
      {/* overflow-x: clip (NOT hidden) — clips horizontal overflow without
          creating a scroll container, so storefront `position: sticky`
          elements (e.g. the mobile PDP live-preview strip) still pin to the
          viewport. `overflow-x: hidden` forces overflow-y to `auto` and breaks
          sticky. Same reason SiteNav uses overflow-x-clip. */}
      <main className="flex-1 overflow-x-clip">{children}</main>
      <SiteFooter />
      <CartDrawer />
    </div>
  );
}
