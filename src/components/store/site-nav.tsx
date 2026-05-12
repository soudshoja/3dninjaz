"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { Menu, X, ChevronDown, ChevronRight, Search } from "lucide-react";
import { createPortal } from "react-dom";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { UserNav } from "@/components/auth/user-nav";
import { CartButton } from "@/components/store/cart-button";
import { BUSINESS } from "@/lib/business-info";
import type { CategoryTreeNode } from "@/lib/catalog";

const INTENT_DELAY_MS = 200;
const MAX_DISPLAY = 8;

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
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    }, INTENT_DELAY_MS);
  }

  useEffect(() => () => clearLeave(), []);

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
          if (e.key === "Escape") onClose();
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
          className="absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-lg border border-zinc-200 bg-white shadow-sm py-1"
          onMouseEnter={clearLeave}
          onMouseLeave={scheduleClose}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        >
          <ul role="list">
            {activeCategories.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={`/shop?category=${encodeURIComponent(cat.slug)}`}
                  onClick={onClose}
                  className="block px-4 py-2.5 text-sm hover:bg-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  style={{ color: BRAND.ink, "--tw-ring-color": BRAND.blue } as React.CSSProperties}
                >
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
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
        <Link
          href={`/shop?category=${encodeURIComponent(cat.slug)}`}
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          className="flex-1 hover:opacity-70 transition-opacity"
          style={{ color: BRAND.ink }}
        >
          {cat.name}
        </Link>
        {cat.products.length > 0 && (
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            role="button"
            tabIndex={0}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
            className="p-1"
          >
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              aria-hidden
            />
          </span>
        )}
      </button>

      {isExpanded && cat.products.length > 0 && (
        <div className="pb-3 px-1">
          <ul role="list" className="flex flex-col">
            {cat.products.slice(0, MAX_DISPLAY).map((product) => (
              <li key={product.id}>
                <Link
                  href={`/products/${product.slug}`}
                  onClick={onNavigate}
                  className="block px-2 py-2 text-sm rounded-lg hover:bg-zinc-50 transition-colors"
                  style={{ color: BRAND.ink }}
                >
                  {product.name}
                </Link>
              </li>
            ))}
          </ul>

          {cat.productCount > MAX_DISPLAY && (
            <div className="mt-2 px-2">
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [mobileShopOpen, setMobileShopOpen] = useState(false);
  const [openMobileCategoryId, setOpenMobileCategoryId] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/shop?search=${encodeURIComponent(q)}`);
      setSearchQuery("");
      setSearchVisible(false);
    }
  }

  function toggleSearch() {
    setSearchVisible((v) => {
      if (!v) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      return !v;
    });
  }

  const activeCategories = categoryTree.filter((c) => c.productCount > 0);

  useEffect(() => {
    setOpen(false);
    setShopOpen(false);
    setMobileShopOpen(false);
    setOpenMobileCategoryId(null);
    setSearchVisible(false);
    setSearchQuery("");
  }, [pathname]);

  useEffect(() => { setPortalMounted(true); }, []);

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

  useEffect(() => {
    if (!searchVisible) return;
    function onPointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setSearchVisible(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [searchVisible]);

  const handleShopOpen = useCallback(() => setShopOpen(true), []);
  const handleShopClose = useCallback(() => setShopOpen(false), []);

  const nonShopLinks = [
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <>
    <nav
      ref={navRef}
      aria-label="Primary"
      className="sticky top-0 z-40 border-b border-zinc-200 backdrop-blur bg-white/90"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-8 py-2">

        {/* Desktop: left group (logo + nav links) */}
        <div className="hidden md:flex items-center gap-6">
          <Link href="/" className="flex items-center">
            <Logo size={72} priority />
          </Link>
          <div className="flex items-center gap-6 text-sm font-semibold">
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
        </div>

        {/* Desktop: right group (social + search + cart + user) */}
        <div className="hidden md:flex items-center gap-1">
          <a
            href={BUSINESS.socials.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-full transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </a>
          <a
            href={BUSINESS.socials.tiktok}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TikTok"
            className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-full transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
            </svg>
          </a>
          <div className="flex items-center">
            {searchVisible && (
              <form onSubmit={handleSearch} className="mr-1">
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  aria-label="Search products"
                  className="w-44 lg:w-56 h-9 rounded-full border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-transparent focus:ring-2 transition-colors"
                  style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
                  onKeyDown={(e) => { if (e.key === "Escape") { setSearchVisible(false); setSearchQuery(""); } }}
                />
              </form>
            )}
            <button
              type="button"
              aria-label={searchVisible ? "Close search" : "Search"}
              aria-expanded={searchVisible}
              onClick={toggleSearch}
              className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-full hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
            >
              {searchVisible ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Search className="h-5 w-5" aria-hidden />
              )}
            </button>
          </div>
          <CartButton />
          <UserNav />
        </div>

        {/* Mobile: hamburger left, logo center, search+cart right */}
        <div className="flex md:hidden items-center justify-between w-full">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-nav-mobile"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-full hover:bg-black/5 shrink-0"
          >
            <Menu className="h-6 w-6" aria-hidden />
          </button>

          {/* Centered logo — absolute so it doesn't push the side icons */}
          <Link
            href="/"
            className="absolute left-1/2 -translate-x-1/2 flex items-center"
          >
            <Logo size={72} priority />
          </Link>

          {/* Right icons */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              aria-label={searchVisible ? "Close search" : "Search"}
              aria-expanded={searchVisible}
              onClick={toggleSearch}
              className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-full hover:bg-black/5 transition-colors"
            >
              {searchVisible ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Search className="h-5 w-5" aria-hidden />
              )}
            </button>
            <CartButton />
          </div>
        </div>
      </div>

      {/* Mobile search bar — slides in below nav bar */}
      {searchVisible && (
        <div className="md:hidden border-t border-zinc-100 px-4 py-2 bg-white">
          <form onSubmit={handleSearch}>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
              className="w-full h-9 rounded-full border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-transparent focus:ring-2 transition-colors"
              style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchVisible(false);
                  setSearchQuery("");
                }
              }}
            />
          </form>
        </div>
      )}
    </nav>

    {/* Mobile drawer — always in DOM once mounted; CSS drives open/close animation */}
    {portalMounted && createPortal(
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-in-out ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
          aria-hidden
          onClick={() => setOpen(false)}
        />

        {/* Drawer panel — slides down from top */}
        <div
          id="site-nav-mobile"
          aria-hidden={!open}
          className={`fixed inset-x-0 top-0 z-50 bg-white max-h-screen overflow-y-auto shadow-xl transition-transform duration-300 ease-in-out ${open ? "translate-y-0" : "-translate-y-full"}`}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-200">
            <Link href="/" className="flex items-center min-h-[48px]" onClick={() => setOpen(false)}>
              <Logo size={72} priority />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-full hover:bg-black/5"
            >
              <X className="h-6 w-6" aria-hidden />
            </button>
          </div>

          <ul className="flex flex-col px-6 py-2">
            {/* Shop accordion */}
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

          {/* Bottom utility: account + social */}
          <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between gap-4">
            <UserNav variant="mobile" />
            <div className="flex items-center gap-3">
              {BUSINESS.socials.instagram && (
                <a
                  href={BUSINESS.socials.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="inline-flex items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </a>
              )}
              {BUSINESS.socials.tiktok && (
                <a
                  href={BUSINESS.socials.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className="inline-flex items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/></svg>
                </a>
              )}
            </div>
          </div>
        </div>
      </>,
      document.body
    )}
    </>
  );
}
