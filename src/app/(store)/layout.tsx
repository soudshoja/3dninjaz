import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { UserNav } from "@/components/auth/user-nav";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--color-brand-border)] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="3D Ninjaz"
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
              priority
            />
            <span className="font-heading text-lg text-[var(--color-brand-text-primary)]">
              3D Ninjaz
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/"
              className="text-sm font-medium text-[var(--color-brand-text-primary)] hover:text-[var(--color-brand-primary)]"
            >
              Shop
            </Link>
          </nav>
          <UserNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-[var(--color-brand-border)] bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-[var(--color-brand-text-muted)]">
          &copy; {new Date().getFullYear()} 3D Ninjaz &middot; Ninja crafted in
          Malaysia
        </div>
      </footer>
    </div>
  );
}
