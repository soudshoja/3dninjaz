import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { getPendingReviewCount } from "@/actions/admin-reviews";

// Mobile chip strip — single source of truth for both desktop sidebar and
// mobile horizontal nav. Phase 5 added 7 entries; the chip strip overflows
// horizontally and scrolls (intentional, D-04 mobile pattern).
const MOBILE_CHIPS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/products/import", label: "Bulk import" },
  { href: "/admin/email-templates", label: "Email templates" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/shipping", label: "Shipping" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/profile", label: "Profile" },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Convenience redirect. NOT a security boundary — every server action that
  // mutates admin data must independently call requireAdmin() (T-03-01 /
  // CVE-2025-29927 mitigation).
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "admin") {
    redirect("/login");
  }

  // Pending review badge is informational; if the action throws (e.g. DB
  // hiccup) we fall back to 0 rather than crash the entire admin shell.
  let pendingReviewCount = 0;
  try {
    pendingReviewCount = await getPendingReviewCount();
  } catch {
    pendingReviewCount = 0;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden w-64 flex-col border-r border-[var(--color-brand-border)] bg-white p-6 md:flex">
        <Link href="/admin" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="3D Ninjaz"
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover"
            priority
          />
          <span className="font-heading text-base text-[var(--color-brand-text-primary)]">
            3D Ninjaz Admin
          </span>
        </Link>
        <SidebarNav pendingReviewCount={pendingReviewCount} />
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-[var(--color-brand-border)] bg-white px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="3D Ninjaz"
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover"
              />
              <span className="font-heading text-sm text-[var(--color-brand-text-primary)]">
                3D Ninjaz Admin
              </span>
            </Link>
            {/* Mobile sign-out — desktop sidebar already has SignOutButton at
                its bottom; the mobile header lacked any way to sign out, so
                admins were stuck in /admin without a logout affordance. */}
            <div className="shrink-0">
              <SignOutButton />
            </div>
          </div>
          {/*
            Mobile nav strip — the sidebar is hidden below md so without this
            strip there is no path to admin sub-pages on a phone. After Phase 5
            the chip count is 11; the strip scrolls horizontally per the
            existing admin-order-filter pattern. Tap targets are 40px high.
          */}
          <nav
            aria-label="Admin sections"
            className="mt-3 flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 text-xs"
          >
            {MOBILE_CHIPS.map((chip) => (
              <Link
                key={chip.href}
                href={chip.href}
                className="inline-flex items-center rounded-full border px-3 min-h-[40px] whitespace-nowrap text-[var(--color-brand-text-primary)] border-[var(--color-brand-border)]"
              >
                {chip.label}
                {chip.href === "/admin/reviews" && pendingReviewCount > 0 ? (
                  <span
                    className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
                    aria-label={`${pendingReviewCount} pending`}
                  >
                    {pendingReviewCount}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
