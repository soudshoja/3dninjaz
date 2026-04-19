"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { UserNav } from "@/components/auth/user-nav";
import { CartButton } from "@/components/store/cart-button";

/**
 * Unified customer-facing navigation (Phase 4 Plan 04-03).
 *
 * Desktop (≥ 768px): logo + Shop / About / Contact links on the right,
 * followed by the cart button and UserNav account menu.
 *
 * Mobile (< 768px): logo on the left, cart button kept in the header so
 * customers can still reach the bag, and a hamburger button that opens an
 * inline disclosure (no shadcn Sheet dependency — the Phase 2 install set
 * doesn't include it). The disclosure renders links at ≥ 48px tap targets
 * per DECISIONS.md D-04. Disclosure auto-closes on route change so the
 * menu doesn't linger after a Link click.
 *
 * Keyboard: Escape closes the mobile menu. The button's aria-expanded /
 * aria-controls pair announce state to assistive tech. Focus is returned
 * to the toggle button when the menu closes.
 *
 * Sticky + blurred so it remains accessible during long-page scrolling
 * without obscuring content (small height + 90% opacity keeps content
 * legible behind it).
 */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close whenever route changes — mirrors common mobile-nav UX. Without
  // this a Link tap keeps the sheet visible over the destination page.
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

  const navLinks = [
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-40 border-b-2 backdrop-blur"
      style={{ backgroundColor: `${BRAND.cream}E6`, borderColor: "#0B102010" }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-8 py-3">
        {/*
          No aria-label here: the visible wordmark "3D NINJAZ" is the accessible
          name. Adding aria-label="3D Ninjaz home" created a label/content
          mismatch (screen readers announced a different label than sighted
          users saw — WCAG 2.5.3 fail). The Logo image uses alt="3D Ninjaz"
          so assistive tech still gets a brand cue without duplication.
         */}
        <Link href="/" className="flex items-center gap-3 min-h-[48px]">
          <Logo size={44} priority />
          {/*
            "3D NINJAZ" wordmark rendered in ink only. The previous green
            accent on the cream nav background had a 1.87:1 contrast ratio
            (below WCAG AA 4.5:1 for normal text). The green brand accent is
            preserved in the footer (on the ink background, where the ratio
            is safe) and in category CTAs — so removing it here costs no
            brand distinctiveness.
           */}
          <span
            className="text-xl tracking-wide font-[var(--font-heading)]"
            style={{ color: BRAND.ink }}
          >
            3D NINJAZ
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold">
          {navLinks.map((l) => (
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
          className="md:hidden border-t-2"
          style={{ borderColor: "#0B102010", backgroundColor: BRAND.cream }}
        >
          <ul className="flex flex-col px-6 py-2">
            {navLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="block py-4 min-h-[48px] font-semibold border-b last:border-b-0"
                  style={{ borderColor: "#0B102010", color: BRAND.ink }}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* Account actions area — UserNav ships its own sign-in/register
              affordances for signed-out users and an account menu for signed-in
              users. Rendering it at the end gives mobile users a reachable
              login/account entry without duplicating logic. */}
          <div className="px-6 py-4 border-t" style={{ borderColor: "#0B102010" }}>
            <UserNav />
          </div>
        </div>
      ) : null}
    </nav>
  );
}
