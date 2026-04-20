import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-3"
        aria-label="3D Ninjaz home"
      >
        <Image
          src="/logo.png"
          alt="3D Ninjaz"
          width={64}
          height={64}
          priority
          className="h-16 w-16 rounded-full object-cover"
        />
      </Link>
      <main className="w-full max-w-md rounded-2xl bg-white border border-zinc-200 p-8 shadow-sm">
        {children}
      </main>
      <footer className="mt-6 text-xs text-zinc-500">
        &copy; {new Date().getFullYear()} 3D Ninjaz &middot; Ninja crafted in Malaysia
      </footer>
    </div>
  );
}
