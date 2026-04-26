"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Admin nav grouped into collapsible sections by function. Replaces the
// flat list from the prior iteration per user feedback ("finance anything
// related under it, product anything related under it, etc.").
// Groups collapse/expand; state persists to localStorage per-group.

type NavItem = {
  href: string;
  label: string;
  ninjaIcon: string;
  exact?: boolean;
  badge?: "pendingReviewCount" | "reconDriftCount";
};

type NavGroup = { name: string; title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    name: "catalog",
    title: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", ninjaIcon: "shop" },
      { href: "/admin/categories", label: "Categories", ninjaIcon: "portfolio" },
      { href: "/admin/inventory", label: "Inventory", ninjaIcon: "download" },
      {
        href: "/admin/products/import",
        label: "Bulk import",
        ninjaIcon: "download",
        exact: true,
      },
    ],
  },
  {
    name: "sales",
    title: "Sales",
    items: [
      { href: "/admin/orders", label: "Orders", ninjaIcon: "download" },
      { href: "/admin/disputes", label: "Disputes", ninjaIcon: "warning" },
    ],
  },
  {
    name: "finance",
    title: "Finance",
    items: [
      { href: "/admin/payments", label: "Payments", ninjaIcon: "secure" },
      {
        href: "/admin/recon",
        label: "Reconciliation",
        ninjaIcon: "secure",
        badge: "reconDriftCount",
      },
    ],
  },
  {
    name: "customers",
    title: "Customers",
    items: [
      { href: "/admin/users", label: "Customers", ninjaIcon: "about" },
    ],
  },
  {
    name: "marketing",
    title: "Marketing",
    items: [
      { href: "/admin/email-templates", label: "Email templates", ninjaIcon: "contact" },
      { href: "/admin/subscribers", label: "Subscribers", ninjaIcon: "contact" },
      { href: "/admin/coupons", label: "Coupons", ninjaIcon: "tip" },
      { href: "/admin/colours", label: "Colours", ninjaIcon: "portfolio" },
      {
        href: "/admin/reviews",
        label: "Reviews",
        ninjaIcon: "great",
        badge: "pendingReviewCount",
      },
    ],
  },
  {
    name: "operations",
    title: "Operations",
    items: [
      { href: "/admin/shipping", label: "Shipping (flat-rate)", ninjaIcon: "download" },
      { href: "/admin/shipping/delyva", label: "Delyva courier", ninjaIcon: "services" },
      { href: "/admin/settings", label: "Site settings", ninjaIcon: "services" },
    ],
  },
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

function storageKey(groupName: string): string {
  return `admin-nav-group-${groupName}`;
}

/**
 * Admin sidebar navigation. After Phase 9 the list is grouped into collapsible
 * sections by function (catalog, sales, finance, customers, marketing, ops).
 * Group open-state persists to localStorage per-group. On mobile the chip
 * strip in the admin layout remains flat.
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

  // All groups default to CLOSED on first load — admins click to open what
  // they need. Persist per-group after first toggle. Exception: if the
  // current path is inside a group, that group auto-opens so the active
  // item is visible.
  const [openState, setOpenState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of GROUPS) initial[g.name] = false;
    return initial;
  });

  // Rehydrate from localStorage after mount (SSR cannot see it). Also
  // auto-open the group containing the current path if no explicit
  // localStorage preference exists for it yet.
  //
  // Important (bug fix 2026-04-20): groups with NO stored preference must
  // reflect the CURRENT pathname — previously, navigating from a grouped page
  // back to /admin left the prior group open (a stale auto-open). Now: sticky
  // preference wins, otherwise the group is open IFF the current path matches
  // one of its items. Landing on /admin closes every auto-opened group.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpenState((prev) => {
      const next = { ...prev };
      for (const g of GROUPS) {
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(storageKey(g.name));
        } catch {
          /* localStorage unavailable — keep defaults */
        }
        if (stored === "0") next[g.name] = false;
        else if (stored === "1") next[g.name] = true;
        else {
          // No stored preference — open only if current path is in group.
          // This intentionally closes previously auto-opened groups when the
          // admin navigates to a page outside them (e.g. /admin dashboard).
          const inGroup = g.items.some(
            (item) =>
              pathname === item.href || pathname.startsWith(item.href + "/")
          );
          next[g.name] = inGroup;
        }
      }
      return next;
    });
  }, [pathname]);

  const toggleGroup = (name: string) => {
    setOpenState((prev) => {
      const open = !prev[name];
      const next = { ...prev, [name]: open };
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(storageKey(name), open ? "1" : "0");
        }
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const renderItem = (item: NavItem) => {
    const active = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    const badgeKey = item.badge;
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
  };

  return (
    <nav className="mt-6 flex flex-col gap-1" aria-label="Admin navigation">
      {/* Dashboard — flat, top */}
      {renderItem({
        href: "/admin",
        label: "Dashboard",
        ninjaIcon: "home",
        exact: true,
      })}

      {GROUPS.map((g) => {
        if (g.items.length === 0) return null;
        const open = openState[g.name] ?? false;
        return (
          <div key={g.name} className="mt-3">
            <button
              type="button"
              onClick={() => toggleGroup(g.name)}
              aria-expanded={open}
              aria-controls={`nav-group-${g.name}`}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-brand-text-muted)] hover:text-[var(--color-brand-text-primary)]"
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  open ? "rotate-0" : "-rotate-90"
                )}
                aria-hidden
              />
              <span>{g.title}</span>
            </button>
            {open ? (
              <div
                id={`nav-group-${g.name}`}
                className="flex flex-col gap-1 pl-1"
              >
                {g.items.map(renderItem)}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Profile + Guide — flat, bottom, separator above */}
      <div className="mt-6 border-t border-[var(--color-brand-border)] pt-3 flex flex-col gap-1">
        {renderItem({
          href: "/admin/guide",
          label: "Guide",
          ninjaIcon: "tip",
        })}
        {renderItem({
          href: "/admin/profile",
          label: "Profile",
          ninjaIcon: "login",
        })}
      </div>
    </nav>
  );
}
