"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, FolderOpen, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package, exact: false },
  {
    href: "/admin/categories",
    label: "Categories",
    icon: FolderOpen,
    exact: false,
  },
  { href: "/admin/orders", label: "Orders", icon: Receipt, exact: false },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-8 flex flex-col gap-1" aria-label="Admin navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
