import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { AdminUserBadge } from "@/components/admin/admin-user-badge";

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
        <SidebarNav />
        <div className="mt-auto">
          <AdminUserBadge
            name={session.user.name}
            email={session.user.email}
          />
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
          </div>
          {/*
            Mobile nav strip — the sidebar is hidden below md so without this
            strip there is no path to /admin/products, /admin/categories or
            /admin/orders on a phone. Tap targets are 40px high (min-h-[40px]).
          */}
          <nav
            aria-label="Admin sections"
            className="mt-3 flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 text-xs"
          >
            <Link
              href="/admin"
              className="inline-flex items-center rounded-full border px-3 min-h-[40px] whitespace-nowrap text-[var(--color-brand-text-primary)] border-[var(--color-brand-border)]"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/products"
              className="inline-flex items-center rounded-full border px-3 min-h-[40px] whitespace-nowrap text-[var(--color-brand-text-primary)] border-[var(--color-brand-border)]"
            >
              Products
            </Link>
            <Link
              href="/admin/categories"
              className="inline-flex items-center rounded-full border px-3 min-h-[40px] whitespace-nowrap text-[var(--color-brand-text-primary)] border-[var(--color-brand-border)]"
            >
              Categories
            </Link>
            <Link
              href="/admin/orders"
              className="inline-flex items-center rounded-full border px-3 min-h-[40px] whitespace-nowrap text-[var(--color-brand-text-primary)] border-[var(--color-brand-border)]"
            >
              Orders
            </Link>
          </nav>
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
