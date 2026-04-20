import Link from "next/link";
import { BRAND } from "@/lib/brand";

/**
 * Phase 7 (07-09) — branded 404 page body.
 *
 * Used by src/app/not-found.tsx (server component). Tap targets >= 48px;
 * mobile validated.
 */
export function BrandedNotFound() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="max-w-lg w-full text-center">
        <div
          className="mx-auto mb-6 inline-block rounded-3xl p-3"
          style={{ backgroundColor: BRAND.ink }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ninja-lost.svg"
            alt=""
            width={200}
            height={200}
            className="block"
          />
        </div>
        <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl mb-3">
          The ninja went stealth on this page
        </h1>
        <p className="text-slate-700 mb-6">
          We could not find what you are looking for. It may have moved or
          never existed.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 text-white font-semibold"
            style={{ backgroundColor: BRAND.blue }}
          >
            Back to homepage
          </Link>
          <Link
            href="/shop"
            className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 font-semibold border-2"
            style={{ borderColor: BRAND.ink, color: BRAND.ink }}
          >
            Browse shop
          </Link>
        </div>
      </div>
    </main>
  );
}
