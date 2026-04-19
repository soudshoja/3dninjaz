import type { ReactNode } from "react";
import { SiteNav } from "@/components/store/site-nav";
import { SiteFooter } from "@/components/store/site-footer";
import { CartDrawer } from "@/components/store/cart-drawer";
import { BRAND } from "@/lib/brand";

/**
 * Customer-facing route-group layout. Cream background, ink text,
 * unified SiteNav + SiteFooter (Phase 4 Plan 04-03). Individual pages
 * pick their own max widths — the layout intentionally does not clamp
 * content width so full-bleed hero / wave sections can reach the
 * viewport edges.
 */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
      className="min-h-screen flex flex-col"
    >
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CartDrawer />
    </div>
  );
}
