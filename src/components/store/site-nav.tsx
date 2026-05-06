"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { UserNav } from "@/components/auth/user-nav";
import { CartButton } from "@/components/store/cart-button";
import { CategorySheet } from "@/components/store/category-sheet";
import type { CategoryTreeNode } from "@/lib/catalog";

/**
 * Small helper to render a 24px ninja icon next to a mobile nav link.
 * Uses the @128 variant; the browser scales down cleanly. Decorative
 * alt="" — the link text is the accessible name.
 */
function MobileNavIcon({ name }: { name: string }) {
  return (
    <Image
      src={`/icons/ninja/nav/${name}@128.png`}
      alt=""
      width={24}
      height={24}
      className="h-6 w-6 object-contain shrink-0"
    />
  );
}

/**
 * Compact 18px ninja icon for the desktop nav links. Sits to the LEFT
 * of the link text with a small gap. Visible from the `md` breakpoint
 * (>= 768px) so icons show on any desktop/tablet where the desktop nav
 * itself appears. (Previous `xl` gated them to >=1280px, which hid them
 * on most laptops at 1024–1280px widths.) `src` accepts any path under
 * /icons/ninja/ (both nav/ and emoji/ folders), since Contact reuses
 * the envelope emoji ninja.
 */
function DesktopNavIcon({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={18}
      height={18}
      className="hidden md:inline-block h-[18px] w-[18px] object-contain shrink-0"
    />
  );
}

/**
 * Unified customer-facing navigation (Phase 4 Plan 04-03, expanded in 08-01).
 *
 * Desktop (>= 768px): logo + Shop (with a hover mega-menu of categories +
 * their subcategories) / About / Contact links on the right, followed by the
 * cart button and UserNav account menu.
 *
 * Mobile (< 768px): logo left, cart button kept in the header, hamburger
 * toggles a full inline disclosure that includes a nested, expandable list
 * of categories and subcategories.
 *
 * The category tree is loaded once by the server layout and passed in as
 * a prop, so the nav component renders the same markup on every page
 * without re-querying.
 */
export function SiteNav({ categoryTree }: { categoryTree: CategoryTreeNode[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);

  // Close mobile drawer whenever route changes — standard mobile-nav UX.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape-to-close + body scroll lock while the mobile menu is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nonShopLinks = [
    {
      href: "/about",
      label: "About",
      desktopIcon: "/icons/ninja/nav/about.png",
    },
    {
      href: "/contact",
      label: "Contact",
      desktopIcon: "/icons/ninja/emoji/contact.png",
    },
  ];
  // Slugs for the mobile disclosure (MobileNavIcon expects a nav/ filename).
  // Desktop link icons are declared inline on each entry above via
  // `desktopIcon`, because Contact reuses the emoji/ folder and mobile
  // hard-codes the envelope ninja separately below.
  const MOBILE_ICONS: Record<string, string> = {
    "/about": "about",
    // Contact page gets the envelope emoji — there's no contact ninja in
    // the nav set. The MobileNavIcon helper hard-wires the nav/ folder, so
    // only use nav/* slugs here (about matches the profile bubble).
  };

  function openCategorySheet() {
    setOpen(false);
    setCategorySheetOpen(true);
  }

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-40 border-b border-zinc-200 backdrop-blur bg-white/90"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-8 py-3">
        <Link href="/" className="flex items-center gap-3 min-h-[48px]">
          <Logo size={44} priority />
          <span
            className="text-xl tracking-wide font-[var(--font-heading)]"
            style={{ color: BRAND.ink }}
          >
            3D NINJAZ
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold">
          {/* Shop — opens the CategorySheet */}
          <button
            type="button"
            onClick={openCategorySheet}
            aria-haspopup="dialog"
            aria-expanded={categorySheetOpen}
            className="inline-flex items-center gap-2 min-h-[48px] hover:opacity-70 transition-opacity"
          >
            <DesktopNavIcon src="/icons/ninja/nav/shop.png" />
            Shop
          </button>
          {nonShopLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-2 min-h-[48px] hover:opacity-70 transition-opacity"
            >
              <DesktopNavIcon src={l.desktopIcon} />
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <CartButton />
          <div className="hidden md:block">
            <UserNav />
          </div>
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-nav-mobile"
            aria-label={open ? "Close menu" : "Open menu"}
            className="md:hidden inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-full hover:bg-black/5"
          >
            {open ? (
              <X className="h-6 w-6" aria-hidden />
            ) : (
              <Menu className="h-6 w-6" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Mobile disclosure */}
      {open ? (
        <div
          id="site-nav-mobile"
          className="md:hidden border-t border-zinc-200 max-h-[80vh] overflow-y-auto bg-white"
        >
          <ul className="flex flex-col px-6 py-2">
            <li>
              <button
                type="button"
                className="flex items-center gap-3 py-4 min-h-[48px] font-semibold border-b border-zinc-100 w-full text-left"
                style={{ color: BRAND.ink }}
                onClick={openCategorySheet}
                aria-haspopup="dialog"
                aria-expanded={categorySheetOpen}
              >
                <MobileNavIcon name="shop" />
                <span>Shop</span>
              </button>
            </li>
            {nonShopLinks.map((l) => {
              const iconName = MOBILE_ICONS[l.href];
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="flex items-center gap-3 py-4 min-h-[48px] font-semibold border-b border-zinc-100 last:border-b-0"
                    style={{ color: BRAND.ink }}
                    onClick={() => setOpen(false)}
                  >
                    {iconName ? <MobileNavIcon name={iconName} /> : null}
                    {l.href === "/contact" ? (
                      <Image
                        src="/icons/ninja/emoji/contact@128.png"
                        alt=""
                        width={24}
                        height={24}
                        className="h-6 w-6 object-contain shrink-0"
                      />
                    ) : null}
                    <span>{l.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="px-6 py-4 border-t border-zinc-200">
            <UserNav variant="mobile" />
          </div>
        </div>
      ) : null}

      {/* Category sheet — shared between desktop and mobile Shop triggers */}
      <CategorySheet
        open={categorySheetOpen}
        onOpenChange={setCategorySheetOpen}
        categories={categoryTree}
      />
    </nav>
  );
}
