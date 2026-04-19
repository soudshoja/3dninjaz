import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { UserNav } from "@/components/auth/user-nav";
import { CartButton } from "@/components/store/cart-button";

/**
 * Customer-facing store navigation. Sticky, cream with 90% opacity + blur,
 * ink border-bottom. Mirrors the demo's visual language.
 */
export function StoreNav() {
  return (
    <nav
      className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-3 border-b-2 backdrop-blur"
      style={{ backgroundColor: `${BRAND.cream}E6`, borderColor: "#0B102010" }}
    >
      <Link href="/" className="flex items-center gap-3" aria-label="3D Ninjaz home">
        <Logo size={44} priority />
        <span
          className="text-xl tracking-wide font-[var(--font-heading)]"
          style={{ color: BRAND.ink }}
        >
          3D <span style={{ color: BRAND.green }}>NINJAZ</span>
        </span>
      </Link>
      <div className="hidden md:flex gap-8 text-sm font-semibold">
        <Link href="/shop" className="hover:opacity-70">
          Shop
        </Link>
        <Link href="/#how" className="hover:opacity-70">
          How it works
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <CartButton />
        <UserNav />
      </div>
    </nav>
  );
}
