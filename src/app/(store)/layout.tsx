import type { ReactNode } from "react";
import { StoreNav } from "@/components/store/store-nav";
import { StoreFooter } from "@/components/store/store-footer";
import { CartDrawer } from "@/components/store/cart-drawer";
import { BRAND } from "@/lib/brand";

/**
 * Customer-facing route-group layout. Cream background, ink text,
 * demo-inspired nav + footer. Individual pages pick their own max widths —
 * the layout intentionally does not clamp content width so full-bleed
 * hero / wave sections can reach the viewport edges.
 */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
      className="min-h-screen flex flex-col"
    >
      <StoreNav />
      <main className="flex-1">{children}</main>
      <StoreFooter />
      <CartDrawer />
    </div>
  );
}
