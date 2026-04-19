"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  MapPin,
  Package,
  Shield,
  Trash2,
  User,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Account-shell navigation. Mobile (<768px): horizontal scrollable chip strip.
 * Desktop (>=768px): vertical sidebar with active-state accent.
 *
 * Tap targets: every link >= 48px (D-04 mobile rule).
 */
type Item = {
  href: string;
  label: string;
  icon: typeof User;
  danger?: boolean;
};

const ITEMS: Item[] = [
  { href: "/account", label: "Profile", icon: User },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/orders", label: "My orders", icon: Package },
  { href: "/account/security", label: "Security", icon: Shield },
  { href: "/account/close", label: "Close account", icon: Trash2, danger: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountSidebar() {
  const pathname = usePathname() ?? "/account";

  return (
    <nav aria-label="Account">
      {/* Mobile chip strip */}
      <ul className="flex md:hidden gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          const Icon = it.icon;
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border-2 text-sm font-bold whitespace-nowrap"
                style={{
                  backgroundColor: active
                    ? it.danger
                      ? "#DC2626"
                      : BRAND.ink
                    : "transparent",
                  color: active
                    ? "#ffffff"
                    : it.danger
                      ? "#DC2626"
                      : BRAND.ink,
                  borderColor: it.danger ? "#DC2626" : BRAND.ink,
                }}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop sidebar */}
      <ul className="hidden md:flex md:flex-col gap-1">
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          const Icon = it.icon;
          const danger = it.danger;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-3 min-h-[48px] px-4 py-3 rounded-lg font-semibold transition-colors"
                style={{
                  backgroundColor: active
                    ? danger
                      ? "#DC262615"
                      : `${BRAND.green}30`
                    : "transparent",
                  color: danger ? "#DC2626" : BRAND.ink,
                  borderLeft: active
                    ? `4px solid ${danger ? "#DC2626" : BRAND.green}`
                    : "4px solid transparent",
                }}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
