"use client";

import type React from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import type { CategoryTreeNode } from "@/lib/catalog";

const MAX_DISPLAY = 8;

interface CategoryProductDropdownProps {
  category: CategoryTreeNode;
}

/**
 * Compact dropdown panel that appears below a nav category link.
 * Shows up to 8 product thumbnails (64×64) + 2-line product name.
 * Clicking any thumbnail navigates to the product's PDP.
 * A "View all" pill appears at the bottom when the category has more
 * than MAX_DISPLAY products.
 *
 * Positioning is handled by the parent (SiteNav) via `relative` on the
 * trigger wrapper; this component is `absolute top-full left-0`.
 */
export function CategoryProductDropdown({ category }: CategoryProductDropdownProps) {
  const { products, productCount, slug, name } = category;

  if (products.length === 0) return null;

  return (
    <div
      role="region"
      aria-label={`${name} products`}
      className="absolute top-full left-0 z-50 mt-1 min-w-[280px] max-w-[480px] rounded-2xl border border-zinc-200 bg-white shadow-md p-3"
    >
      <ul
        className="grid grid-cols-3 gap-2"
        role="list"
      >
        {products.slice(0, MAX_DISPLAY).map((product) => (
          <li key={product.id}>
            <Link
              href={`/products/${product.slug}`}
              className="flex flex-col items-center gap-1 rounded-lg p-1.5 hover:bg-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{ "--tw-ring-color": BRAND.blue } as React.CSSProperties}
              tabIndex={0}
            >
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                {product.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="text-xs font-bold select-none"
                    style={{ color: BRAND.ink }}
                    aria-hidden="true"
                  >
                    {product.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Name */}
              <span
                className="text-xs text-center leading-tight line-clamp-2 w-full"
                style={{ color: BRAND.ink }}
              >
                {product.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* "View all" pill — shown when category has more than MAX_DISPLAY products */}
      {productCount > MAX_DISPLAY && (
        <div className="mt-2 pt-2 border-t border-zinc-100 text-center">
          <Link
            href={`/shop?category=${encodeURIComponent(slug)}`}
            className="inline-block text-xs font-semibold px-3 py-1 rounded-full transition-opacity hover:opacity-80"
            style={{ color: BRAND.blue }}
          >
            View all {productCount} &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
