"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { CategoryTreeNode } from "@/lib/catalog";

// ---------------------------------------------------------------------------
// Brand accent palette for initial chips — cycles by index so cards have
// visual variety without needing uploaded thumbnails.
// ---------------------------------------------------------------------------
const ACCENT_CYCLE: { bg: string; text: string }[] = [
  { bg: BRAND.blue, text: "#FFFFFF" },
  { bg: BRAND.green, text: "#0B1020" },
  { bg: BRAND.purple, text: "#FFFFFF" },
];

function accentAt(i: number) {
  return ACCENT_CYCLE[i % ACCENT_CYCLE.length];
}

/** First letter(s) of a category name to display in the initial chip. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface CategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryTreeNode[];
}

/**
 * Pattern C — Visual category grid sheet.
 *
 * Desktop: vaul right-side drawer (max-w-md, full height).
 * Mobile:  vaul bottom sheet (85 vh, rounded top corners).
 *
 * Both sides are handled by the existing DrawerContent in
 * src/components/ui/drawer.tsx — no extra primitives needed.
 *
 * Behaviour:
 * - Shows all categories as tappable cards (no hover dependency).
 * - Each card: brand-coloured initial chip OR thumbnailUrl (future), name,
 *   product count badge.
 * - Categories with 0 products are shown greyed-out (cursor-not-allowed,
 *   pointer-events-none so they cannot be tapped).
 * - Empty-state: "No categories yet." when the list is empty.
 * - Navigating to a category closes the sheet via router.push.
 */
export function CategorySheet({
  open,
  onOpenChange,
  categories,
}: CategorySheetProps) {
  const router = useRouter();

  function handleNavigate(slug: string) {
    onOpenChange(false);
    router.push(`/shop?category=${encodeURIComponent(slug)}`);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-label="Shop by category">
        {/* Header */}
        <DrawerHeader className="flex items-center justify-between">
          <DrawerTitle style={{ color: BRAND.ink }}>
            SHOP BY CATEGORY
          </DrawerTitle>
          <DrawerClose
            className="rounded-full p-1.5 hover:bg-black/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" style={{ color: BRAND.ink }} aria-hidden />
          </DrawerClose>
        </DrawerHeader>

        {/* Scrollable grid body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {categories.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-12">
              No categories yet.
            </p>
          ) : (
            <ul
              className="grid grid-cols-2 gap-3"
              role="list"
            >
              {categories.map((cat, i) => {
                const accent = accentAt(i);
                const isEmpty = cat.productCount === 0;
                const countLabel =
                  cat.productCount === 1
                    ? "1 product"
                    : `${cat.productCount} products`;

                return (
                  <li key={cat.id}>
                    {isEmpty ? (
                      /* Empty category — non-interactive, greyed out */
                      <div
                        aria-disabled="true"
                        className="flex flex-col rounded-2xl border border-zinc-200 overflow-hidden cursor-not-allowed opacity-50 select-none"
                        style={{ backgroundColor: BRAND.cream }}
                      >
                        <CategoryCardInner
                          cat={cat}
                          accent={accent}
                          countLabel={countLabel}
                        />
                      </div>
                    ) : (
                      /* Live category — Next.js Link for keyboard + tap */
                      <Link
                        href={`/shop?category=${encodeURIComponent(cat.slug)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          handleNavigate(cat.slug);
                        }}
                        className="flex flex-col rounded-2xl border border-zinc-200 overflow-hidden hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        style={{
                          backgroundColor: BRAND.cream,
                          // @ts-expect-error CSS custom property
                          "--tw-ring-color": BRAND.blue,
                        }}
                        aria-label={`${cat.name} — ${countLabel}`}
                      >
                        <CategoryCardInner
                          cat={cat}
                          accent={accent}
                          countLabel={countLabel}
                        />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* "Browse all" footer link */}
          {categories.length > 0 && (
            <div className="mt-5 text-center">
              <Link
                href="/shop"
                onClick={() => onOpenChange(false)}
                className="text-sm font-semibold underline underline-offset-2"
                style={{ color: BRAND.purple }}
              >
                All drops &rarr;
              </Link>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Internal card body — shared between the Link and the disabled div variants.
// ---------------------------------------------------------------------------
function CategoryCardInner({
  cat,
  accent,
  countLabel,
}: {
  cat: CategoryTreeNode;
  accent: { bg: string; text: string };
  countLabel: string;
}) {
  return (
    <>
      {/* Thumbnail zone — aspect-square */}
      <div className="aspect-square w-full flex items-center justify-center">
        {cat.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cat.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span
            className="text-2xl font-bold tracking-wider select-none"
            style={{
              background: accent.bg,
              color: accent.text,
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {initials(cat.name)}
          </span>
        )}
      </div>

      {/* Text info */}
      <div className="px-3 py-2.5">
        <p
          className="text-base font-semibold leading-snug truncate"
          style={{ color: BRAND.ink }}
        >
          {cat.name}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">{countLabel}</p>
      </div>
    </>
  );
}
