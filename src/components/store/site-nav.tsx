"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { UserNav } from "@/components/auth/user-nav";
import { CartButton } from "@/components/store/cart-button";
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
 * of the link text with a small gap. Hidden on narrow tablet widths so
 * the nav stays uncrowded. `src` accepts any path under /icons/ninja/
 * (both nav/ and emoji/ folders), since Contact reuses the envelope
 * emoji ninja.
 */
function DesktopNavIcon({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={18}
      height={18}
      className="hidden xl:inline-block h-[18px] w-[18px] object-contain shrink-0"
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
  const [shopOpen, setShopOpen] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const shopRef = useRef<HTMLDivElement>(null);

  // Close whenever route changes — standard mobile-nav UX.
  useEffect(() => {
    setOpen(false);
    setShopOpen(false);
    setExpandedCat(null);
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

  // Close desktop mega-menu on outside click / Escape.
  useEffect(() => {
    if (!shopOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!shopRef.current) return;
      if (!shopRef.current.contains(e.target as Node)) setShopOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShopOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [shopOpen]);

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
          {/* Shop with hover/click mega-menu */}
          <div ref={shopRef} className="relative">
            <button
              type="button"
              onClick={() => setShopOpen((v) => !v)}
              onMouseEnter={() => setShopOpen(true)}
              aria-expanded={shopOpen}
              aria-haspopup="true"
              className="inline-flex items-center gap-2 min-h-[48px] hover:opacity-70 transition-opacity"
            >
              <DesktopNavIcon src="/icons/ninja/nav/shop.png" />
              Shop
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
            {shopOpen && categoryTree.length > 0 ? (
              <div
                onMouseLeave={() => setShopOpen(false)}
                className="absolute right-0 top-full mt-2 w-[min(90vw,720px)] rounded-xl border border-zinc-200 shadow-xl p-5 grid gap-6 grid-cols-2 md:grid-cols-3 bg-white"
                role="menu"
              >
                <div className="col-span-2 md:col-span-3 flex items-baseline justify-between pb-2 mb-1 border-b border-zinc-100">
                  <span
                    className="font-[var(--font-heading)] text-lg"
                    style={{ color: BRAND.ink }}
                  >
                    SHOP BY SQUAD
                  </span>
                  <Link
                    href="/shop"
                    className="text-xs font-bold underline"
                    style={{ color: BRAND.purple }}
                    onClick={() => setShopOpen(false)}
                  >
                    All drops &rarr;
                  </Link>
                </div>
                {categoryTree.map((c) => (
                  <div key={c.id} className="min-w-0">
                    <Link
                      href={`/shop?category=${encodeURIComponent(c.slug)}`}
                      className="block font-bold mb-2 hover:opacity-70"
                      style={{ color: BRAND.ink }}
                      onClick={() => setShopOpen(false)}
                    >
                      {c.name}
                    </Link>
                    <ul className="space-y-1">
                      {c.subcategories.length === 0 ? (
                        <li className="text-xs text-slate-500">
                          No subcategories
                        </li>
                      ) : (
                        c.subcategories.map((s) => (
                          <li key={s.id}>
                            <Link
                              href={`/shop?category=${encodeURIComponent(c.slug)}&subcategory=${encodeURIComponent(s.slug)}`}
                              className="block text-sm text-slate-600 hover:text-[color:var(--brand-ink,#0B1020)]"
                              onClick={() => setShopOpen(false)}
                            >
                              {s.name}
                            </Link>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
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
              <Link
                href="/shop"
                className="flex items-center gap-3 py-4 min-h-[48px] font-semibold border-b border-zinc-100"
                style={{ color: BRAND.ink }}
                onClick={() => setOpen(false)}
              >
                <MobileNavIcon name="shop" />
                <span>Shop — all drops</span>
              </Link>
            </li>
            {categoryTree.map((c) => {
              const isExpanded = expandedCat === c.id;
              return (
                <li key={c.id} className="border-b border-zinc-100">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full py-3 min-h-[48px] font-semibold text-left"
                    style={{ color: BRAND.ink }}
                    onClick={() =>
                      setExpandedCat((curr) => (curr === c.id ? null : c.id))
                    }
                    aria-expanded={isExpanded}
                  >
                    <span>{c.name}</span>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  {isExpanded ? (
                    <ul className="pb-3 pl-3">
                      <li>
                        <Link
                          href={`/shop?category=${encodeURIComponent(c.slug)}`}
                          className="block py-2 text-sm min-h-[44px] text-zinc-600"
                          onClick={() => setOpen(false)}
                        >
                          All in {c.name}
                        </Link>
                      </li>
                      {c.subcategories.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={`/shop?category=${encodeURIComponent(c.slug)}&subcategory=${encodeURIComponent(s.slug)}`}
                            className="block py-2 text-sm min-h-[44px] text-zinc-700"
                            onClick={() => setOpen(false)}
                          >
                            {s.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
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
    </nav>
  );
}
