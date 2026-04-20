"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  Receipt,
  Users,
  Tag,
  Settings,
  Truck,
  Mail,
  Star,
  Upload,
  Boxes,
  Wallet,
  UserCog,
  Scale,
  ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Retail/ops sequence: overview → catalog → orders → payments/finance →
// customers → merchandising → ops/config → self. Reordered 2026-04-20 so the
// daily-use items (Dashboard, Products, Orders, Disputes, Reconciliation)
// sit at the top of the scan path and admin-config sinks to the bottom.
const items = [
  // Overview
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  // Catalog
  { href: "/admin/products", label: "Products", icon: Package, exact: false },
  {
    href: "/admin/categories",
    label: "Categories",
    icon: FolderOpen,
    exact: false,
  },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes, exact: false },
  {
    href: "/admin/products/import",
    label: "Bulk import",
    icon: Upload,
    exact: true,
  },
  // Orders + fulfilment
  { href: "/admin/orders", label: "Orders", icon: Receipt, exact: false },
  // Payments / finance / disputes — grouped so post-sale ops hang together.
  { href: "/admin/payments", label: "Payments", icon: Wallet, exact: false },
  { href: "/admin/disputes", label: "Disputes", icon: Scale, exact: false },
  {
    href: "/admin/recon",
    label: "Reconciliation",
    icon: ScanLine,
    exact: false,
    badge: "reconDriftCount" as const,
  },
  // Customers + merchandising
  { href: "/admin/users", label: "Customers", icon: Users, exact: false },
  { href: "/admin/coupons", label: "Coupons", icon: Tag, exact: false },
  {
    href: "/admin/reviews",
    label: "Reviews",
    icon: Star,
    exact: false,
    badge: "pendingReviewCount" as const,
  },
  // Ops / configuration
  { href: "/admin/shipping", label: "Shipping", icon: Truck, exact: false },
  {
    href: "/admin/email-templates",
    label: "Email templates",
    icon: Mail,
    exact: false,
  },
  { href: "/admin/settings", label: "Settings", icon: Settings, exact: false },
  // Self
  { href: "/admin/profile", label: "Profile", icon: UserCog, exact: false },
];

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
        const Icon = item.icon;
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
            <Icon className="h-4 w-4" />
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
