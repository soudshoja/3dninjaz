"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BRAND } from "@/lib/brand";

type Category = { id: string; slug: string; name: string };
const ACCENTS = [BRAND.blue, BRAND.green, BRAND.purple] as const;

/**
 * Horizontal pill chip row for category filtering on /shop (D-02 style).
 * Each chip is a Link so SSR is preserved on /shop; we only need the
 * client `useSearchParams` hook to highlight the active chip.
 *
 * "All" clears the filter. Overflow scrolls horizontally on mobile with
 * negative margin bleed so chips reach the viewport edge.
 */
export function CategoryChips({ categories }: { categories: Category[] }) {
  const params = useSearchParams();
  const active = params.get("category") ?? null;
  if (!categories.length) return null;
  return (
    <nav
      className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0 mb-8"
      aria-label="Filter by category"
    >
      <ul className="flex gap-3 whitespace-nowrap">
        <li>
          <Link
            href="/shop"
            className="inline-flex items-center rounded-full px-5 py-2 text-sm font-bold min-h-[48px]"
            style={{
              backgroundColor: active === null ? BRAND.ink : "white",
              color: active === null ? "white" : BRAND.ink,
              border: `2px solid ${BRAND.ink}`,
            }}
            aria-current={active === null ? "page" : undefined}
          >
            All
          </Link>
        </li>
        {categories.map((c, i) => {
          const isActive = active === c.slug;
          const accent = ACCENTS[i % ACCENTS.length];
          return (
            <li key={c.id}>
              <Link
                href={`/shop?category=${encodeURIComponent(c.slug)}`}
                className="inline-flex items-center rounded-full px-5 py-2 text-sm font-bold min-h-[48px]"
                style={{
                  backgroundColor: isActive ? accent : "white",
                  color: isActive ? "white" : BRAND.ink,
                  border: `2px solid ${accent}`,
                }}
                aria-current={isActive ? "page" : undefined}
              >
                {c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
