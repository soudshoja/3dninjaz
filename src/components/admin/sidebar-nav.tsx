"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Retail/ops sequence: overview → catalog → orders → payments/finance →
// customers → merchandising → ops/config → self. Reordered 2026-04-20 so the
// daily-use items (Dashboard, Products, Orders, Disputes, Reconciliation)
// sit at the top of the scan path and admin-config sinks to the bottom.
//
// 2026-04-20 icon pass: replaced the lucide-react icon set with branded
// ninja icons from /public/icons/ninja/nav/. Keeps the nav scannable while
// reinforcing brand personality. ninjaIcon = filename in .../nav/*@128.png.
const items = [
  // Overview
  { href: "/admin", label: "Dashboard", ninjaIcon: "home", exact: true },
  // Catalog
  { href: "/admin/products", label: "Products", ninjaIcon: "shop", exact: false },
  {
    href: "/admin/categories",
    label: "Categories",
    ninjaIcon: "portfolio",
    exact: false,
  },
  { href: "/admin/inventory", label: "Inventory", ninjaIcon: "portfolio", exact: false },
  {
    href: "/admin/products/import",
    label: "Bulk import",
    ninjaIcon: "download",
    exact: true,
  },
  // Orders + fulfilment
  { href: "/admin/orders", label: "Orders", ninjaIcon: "download", exact: false },
  // Payments / finance / disputes — grouped so post-sale ops hang together.
  { href: "/admin/payments", label: "Payments", ninjaIcon: "secure", exact: false },
  { href: "/admin/disputes", label: "Disputes", ninjaIcon: "warning", exact: false },
  {
    href: "/admin/recon",
    label: "Reconciliation",
    ninjaIcon: "secure",
    exact: false,
    badge: "reconDriftCount" as const,
  },
  // Customers + merchandising
  { href: "/admin/users", label: "Customers", ninjaIcon: "about", exact: false },
  { href: "/admin/coupons", label: "Coupons", ninjaIcon: "tip", exact: false },
  {
    href: "/admin/reviews",
    label: "Reviews",
    ninjaIcon: "great",
    exact: false,
    badge: "pendingReviewCount" as const,
  },
  // Ops / configuration
  { href: "/admin/shipping", label: "Shipping", ninjaIcon: "download", exact: false },
  {
    href: "/admin/email-templates",
    label: "Email templates",
    ninjaIcon: "contact",
    exact: false,
  },
  { href: "/admin/settings", label: "Settings", ninjaIcon: "services", exact: false },
  // Self
  { href: "/admin/profile", label: "Profile", ninjaIcon: "login", exact: false },
];

/**
 * Resolve a ninja icon to its public path. The emoji/ set is used where no
 * suitable nav/ art exists (tip for coupons, warning for disputes, great for
 * reviews, secure for payments/recon, contact for email templates).
 */
function ninjaIconPath(name: string): string {
  const emojiSet = new Set(["tip", "warning", "great", "secure", "contact"]);
  const folder = emojiSet.has(name) ? "emoji" : "nav";
  return `/icons/ninja/${folder}/${name}@128.png`;
}

/**
 * Admin sidebar navigation. After Phase 5 the list grew from 4 → 11 items,
 * which is still comfortable on a 64-col-wide sidebar; on mobile the layout
 * renders a horizontally scrollable chip strip instead (see (admin)/layout.tsx).
 *
 * `pendingReviewCount` is prop-drilled from the server-rendered admin layout
 * so the badge updates on hard navigation without a separate fetch.
 */
export function SidebarNav({
  pendingReviewCount = 0,
  reconDriftCount = 0,
}: {
  pendingReviewCount?: number;
  /** Phase 7 (07-07) — drift count from latest reconciliation run. */
  reconDriftCount?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="mt-8 flex flex-col gap-1" aria-label="Admin navigation">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const badgeKey = (item as { badge?: string }).badge;
        const badgeCount =
          badgeKey === "pendingReviewCount"
            ? pendingReviewCount
            : badgeKey === "reconDriftCount"
              ? reconDriftCount
              : 0;
        const showBadge = !!badgeKey && badgeCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-[var(--color-brand-surface)] text-[var(--color-brand-primary)] font-medium"
                : "text-[var(--color-brand-text-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-primary)]"
            )}
          >
            <Image
              src={ninjaIconPath(item.ninjaIcon)}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 object-contain shrink-0"
            />
            <span>{item.label}</span>
            {showBadge ? (
              <span
                className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white"
                aria-label={`${badgeCount} pending`}
              >
                {badgeCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
