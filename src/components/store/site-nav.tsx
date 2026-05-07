"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { UserNav } from "@/components/auth/user-nav";
import { CartButton } from "@/components/store/cart-button";
import type { CategoryTreeNode } from "@/lib/catalog";

const INTENT_DELAY_MS = 200;
const MAX_DISPLAY = 8;

function CategoryFlyoutContent({
  cat,
  onNavigate,
}: {
  cat: CategoryTreeNode;
  onNavigate: () => void;
}) {
  if (cat.products.length === 0) return null;

  return (
    <div
      role="region"
      aria-label={`${cat.name} products`}
      className="p-3"
    >
      <ul className="grid grid-cols-3 gap-2" role="list">
        {cat.products.slice(0, MAX_DISPLAY).map((product) => (
          <li key={product.id}>
            <Link
              href={`/products/${product.slug}`}
              onClick={onNavigate}
              className="flex flex-col items-center gap-1 rounded-lg p-1.5 hover:bg-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
              tabIndex={0}
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

      {cat.productCount > MAX_DISPLAY && (
        <div className="mt-2 pt-2 border-t border-zinc-100 text-center">
          <Link
            href={`/shop?category=${encodeURIComponent(cat.slug)}`}
            onClick={onNavigate}
            className="inline-block text-xs font-semibold px-3 py-1 rounded-full transition-opacity hover:opacity-80"
            style={{ color: BRAND.blue }}
          >
            View all {cat.productCount} &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}

function ShopNavItem({
  activeCategories,
  isOpen,
  onOpen,
  onClose,
}: {
  activeCategories: CategoryTreeNode[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [hoveredCatId, setHoveredCatId] = useState<string | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function clearLeave() {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function scheduleClose() {
    clearLeave();
    leaveTimer.current = setTimeout(() => {
      onClose();
      setHoveredCatId(null);
    }, INTENT_DELAY_MS);
  }

  useEffect(() => {
    if (!isOpen) setHoveredCatId(null);
  }, [isOpen]);

  useEffect(() => () => clearLeave(), []);

  const activeFlyoutCat = activeCategories.find((c) => c.id === hoveredCatId) ?? null;

  return (
    <div
      className="relative"
      onMouseEnter={() => { clearLeave(); onOpen(); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="inline-flex items-center gap-1 min-h-[48px] hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded"
        style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            isOpen ? onClose() : onOpen();
          }
          if (e.key === "Escape") { onClose(); setHoveredCatId(null); }
        }}
        onClick={() => isOpen ? onClose() : onOpen()}
      >
        Shop
        <ChevronDown
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 z-50 mt-1 flex rounded-2xl border border-zinc-200 bg-white shadow-md"
          onMouseEnter={clearLeave}
          onMouseLeave={scheduleClose}
          onKeyDown={(e) => { if (e.key === "Escape") { onClose(); setHoveredCatId(null); } }}
        >
          {/* Category list */}
          <ul role="list" className="min-w-[180px] py-2 border-r border-zinc-100">
            {activeCategories.map((cat) => (
              <li key={cat.id}>
                <button
                  type="button"
                  aria-expanded={hoveredCatId === cat.id}
                  aria-haspopup="true"
                  className="flex items-center justify-between w-full px-4 py-2.5 min-h-[44px] text-sm font-semibold text-left hover:bg-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  style={{
                    color: BRAND.ink,
                    "--tw-ring-color": BRAND.blue,
                    background: hoveredCatId === cat.id ? "#f4f4f5" : undefined,
                  } as React.CSSProperties}
                  onMouseEnter={() => setHoveredCatId(cat.id)}
                  onFocus={() => setHoveredCatId(cat.id)}
                >
                  <span>{cat.name}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 ml-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          {/* Product flyout */}
          {activeFlyoutCat && activeFlyoutCat.products.length > 0 && (
            <div className="min-w-[280px] max-w-[480px]">
              <CategoryFlyoutContent
                cat={activeFlyoutCat}
                onNavigate={() => { onClose(); setHoveredCatId(null); }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobileCategoryAccordion({
  cat,
  isExpanded,
  onToggle,
  onNavigate,
}: {
  cat: CategoryTreeNode;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <li className="border-b border-zinc-100">
      <button
        type="button"
        className="flex items-center justify-between w-full py-4 min-h-[48px] font-semibold text-left"
        style={{ color: BRAND.ink }}
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span>{cat.name}</span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>

      {isExpanded && cat.products.length > 0 && (
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

export function SiteNav({ categoryTree }: { categoryTree: CategoryTreeNode[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [mobileShopOpen, setMobileShopOpen] = useState(false);
  const [openMobileCategoryId, setOpenMobileCategoryId] = useState<string | null>(null);

  const activeCategories = categoryTree.filter((c) => c.productCount > 0);

  useEffect(() => {
    setOpen(false);
    setShopOpen(false);
    setMobileShopOpen(false);
    setOpenMobileCategoryId(null);
  }, [pathname]);

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

  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!shopOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setShopOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [shopOpen]);

  const handleShopOpen = useCallback(() => setShopOpen(true), []);
  const handleShopClose = useCallback(() => setShopOpen(false), []);

  const nonShopLinks = [
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ];

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

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-semibold">
          <ShopNavItem
            activeCategories={activeCategories}
            isOpen={shopOpen}
            onOpen={handleShopOpen}
            onClose={handleShopClose}
          />

          {nonShopLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center min-h-[48px] hover:opacity-70 transition-opacity"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <CartButton />
          <div className="hidden md:block">
            <UserNav />
          </div>
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
            {/* Shop top-level row */}
            <li className="border-b border-zinc-100">
              <button
                type="button"
                className="flex items-center justify-between w-full py-4 min-h-[48px] font-semibold text-left"
                style={{ color: BRAND.ink }}
                onClick={() => setMobileShopOpen((v) => !v)}
                aria-expanded={mobileShopOpen}
              >
                <span>Shop</span>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 transition-transform ${mobileShopOpen ? "rotate-90" : ""}`}
                  aria-hidden
                />
              </button>

              {mobileShopOpen && (
                <ul className="flex flex-col pl-4 pb-2">
                  {activeCategories.map((cat) => (
                    <MobileCategoryAccordion
                      key={cat.id}
                      cat={cat}
                      isExpanded={openMobileCategoryId === cat.id}
                      onToggle={() =>
                        setOpenMobileCategoryId((prev) => (prev === cat.id ? null : cat.id))
                      }
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
                </ul>
              )}
            </li>

            {/* Static links */}
            {nonShopLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="flex items-center py-4 min-h-[48px] font-semibold border-b border-zinc-100 last:border-b-0"
                  style={{ color: BRAND.ink }}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="px-6 py-4 border-t border-zinc-200">
            <UserNav variant="mobile" />
          </div>
        </div>
      ) : null}
    </nav>
  );
}
