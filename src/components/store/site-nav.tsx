"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { UserNav } from "@/components/auth/user-nav";
import { CartButton } from "@/components/store/cart-button";
import { CategoryProductDropdown } from "@/components/store/category-product-dropdown";
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
 * itself appears. `src` accepts any path under /icons/ninja/.
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

const INTENT_DELAY_MS = 200;

/**
 * Single category trigger in the desktop nav. Handles hover intent with a
 * short debounce so the cursor can move from the label to the dropdown without
 * flicker, and keyboard (Enter/Space = toggle, Escape = close).
 */
function CategoryNavItem({
  cat,
  isOpen,
  onOpen,
  onClose,
}: {
  cat: CategoryTreeNode;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearLeave() {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function scheduleClose() {
    clearLeave();
    leaveTimer.current = setTimeout(onClose, INTENT_DELAY_MS);
  }

  // Cleanup on unmount
  useEffect(() => () => clearLeave(), []);

  return (
    <div
      className="relative"
      onMouseEnter={() => { clearLeave(); onOpen(); }}
      onMouseLeave={scheduleClose}
    >
      {/* The visible trigger: a Link + chevron indicator */}
      <Link
        href={`/shop?category=${encodeURIComponent(cat.slug)}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="inline-flex items-center gap-1 min-h-[48px] hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded"
        style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            isOpen ? onClose() : onOpen();
          }
          if (e.key === "Escape") onClose();
        }}
        onClick={(e) => {
          // On small devices (touch) that reach here, toggle instead of navigate
          if (window.matchMedia("(hover: none)").matches) {
            e.preventDefault();
            isOpen ? onClose() : onOpen();
          }
        }}
      >
        {cat.name}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </Link>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          onMouseEnter={clearLeave}
          onMouseLeave={scheduleClose}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        >
          <CategoryProductDropdown category={cat} />
        </div>
      )}
    </div>
  );
}

/**
 * Mobile accordion item for one category — tap to expand product thumbnails.
 */
function MobileCategoryAccordion({
  cat,
  onNavigate,
}: {
  cat: CategoryTreeNode;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="border-b border-zinc-100">
      <button
        type="button"
        className="flex items-center justify-between w-full py-4 min-h-[48px] font-semibold text-left"
        style={{ color: BRAND.ink }}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-3">
          <MobileNavIcon name="shop" />
          <span>{cat.name}</span>
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>

      {expanded && cat.products.length > 0 && (
        <div className="pb-3 px-1">
          <ul className="grid grid-cols-3 gap-2" role="list">
            {cat.products.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/products/${product.slug}`}
                  onClick={onNavigate}
                  className="flex flex-col items-center gap-1 rounded-lg p-1.5 hover:bg-zinc-50 transition-colors"
                >
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                    {product.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="text-xs font-bold select-none"
                        style={{ color: BRAND.ink }}
                        aria-hidden="true"
                      >
                        {product.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-xs text-center leading-tight line-clamp-2 w-full"
                    style={{ color: BRAND.ink }}
                  >
                    {product.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {cat.productCount > 8 && (
            <div className="mt-2 text-center">
              <Link
                href={`/shop?category=${encodeURIComponent(cat.slug)}`}
                onClick={onNavigate}
                className="text-xs font-semibold"
                style={{ color: BRAND.blue }}
              >
                View all {cat.productCount} &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Unified customer-facing navigation.
 *
 * Desktop (>= 768px): logo + flat category links (filtered to productCount > 0)
 * each with a hover-intent dropdown showing product thumbnails, followed by
 * About / Contact links + cart button + UserNav.
 *
 * Mobile (< 768px): logo left, cart button in header, hamburger toggles a
 * full-height drawer with category accordion items expanding to thumbnail
 * grids, then About / Contact links, then UserNav.
 *
 * The category tree is loaded once by the server layout and passed in as a
 * prop — no per-page re-query.
 */
export function SiteNav({ categoryTree }: { categoryTree: CategoryTreeNode[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  // Filter to categories that have at least one active product
  const activeCategories = categoryTree.filter((c) => c.productCount > 0);

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setOpen(false);
    setOpenCategoryId(null);
  }, [pathname]);

  // Escape-to-close + body scroll lock while the mobile menu is open
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

  // Outside-click closes the desktop dropdown
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!openCategoryId) return;
    function onPointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenCategoryId(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openCategoryId]);

  const handleCategoryOpen = useCallback((id: string) => setOpenCategoryId(id), []);
  const handleCategoryClose = useCallback(() => setOpenCategoryId(null), []);

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

  const MOBILE_ICONS: Record<string, string> = {
    "/about": "about",
  };

  return (
    <nav
      ref={navRef}
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

        {/* Desktop links — flat category row + static links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-semibold">
          {/* Category links with dropdown */}
          {activeCategories.map((cat) => (
            <CategoryNavItem
              key={cat.id}
              cat={cat}
              isOpen={openCategoryId === cat.id}
              onOpen={() => handleCategoryOpen(cat.id)}
              onClose={handleCategoryClose}
            />
          ))}

          {/* Static links */}
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
            {/* Category accordion items */}
            {activeCategories.map((cat) => (
              <MobileCategoryAccordion
                key={cat.id}
                cat={cat}
                onNavigate={() => setOpen(false)}
              />
            ))}

            {/* Static links */}
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
