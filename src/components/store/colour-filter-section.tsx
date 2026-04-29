"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { getReadableTextOn } from "@/lib/colour-contrast";

/**
 * Phase 18 Plan 08 — /shop sidebar colour chip filter.
 *
 * Locked decisions:
 * - D-13: collapsible accordion below categories, default open, first 12
 *   chips visible, "Show all" expands to full list
 * - D-15: chip = 12px hex circle + name pill; active state hex-tinted
 *   background + getReadableTextOn(hex) text colour (WCAG 2.2 SC 1.4.11)
 * - D-16: empty list (no active product uses any colour) → entire section
 *   hidden by the parent caller's data fetch returning [] OR by this
 *   component's chips.length === 0 guard
 *
 * URL grammar: ?colour=galaxy-black,jade-white — comma-separated slugs.
 * Multi-select toggles. Preserves ?category= and ?subcategory= params.
 *
 * The parent page (src/app/(store)/shop/page.tsx) fetches the chip list
 * via getActiveProductColourChips() and passes it as a prop. Filtering
 * the product list by colour intersection happens server-side in
 * resolveProducts via getProductIdsByColourSlugs.
 */

export type ColourChip = { slug: string; name: string; hex: string };

type Props = {
  chips: ColourChip[];
  /** Default visible count before "Show all" expands (D-13 = 12). */
  defaultVisible?: number;
};

export function ColourFilterSection({ chips, defaultVisible = 12 }: Props) {
  const params = useSearchParams();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const activeSlugs = useMemo(() => {
    const raw = params.get("colour") ?? "";
    return new Set(raw.split(",").filter(Boolean));
  }, [params]);

  const currentCategory = params.get("category") ?? null;
  const currentSubcategory = params.get("subcategory") ?? null;

  // D-16 — hide entire section when no chips available
  if (chips.length === 0) return null;

  const visible = expanded ? chips : chips.slice(0, defaultVisible);
  const hasMore = chips.length > defaultVisible;
  const activeCount = activeSlugs.size;

  function buildHref(slug: string): string {
    const next = new Set(activeSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    const sp = new URLSearchParams();
    if (currentCategory) sp.set("category", currentCategory);
    if (currentSubcategory) sp.set("subcategory", currentSubcategory);
    if (next.size > 0) sp.set("colour", Array.from(next).sort().join(","));
    const qs = sp.toString();
    return qs ? `/shop?${qs}` : "/shop";
  }

  return (
    <section className="mt-4">
      {/* 1px zinc-100 divider per UI-SPEC §Surface 5 */}
      <hr className="border-t border-zinc-100 mb-4" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="shop-colour-filter-grid"
        className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-[0.2em]"
        style={{ color: BRAND.ink }}
      >
        <span className="inline-flex items-center gap-2">
          Colour
          {activeCount > 0 ? (
            <span
              className="inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ width: 16, height: 16, backgroundColor: BRAND.ink }}
              aria-label={`${activeCount} colour filter${activeCount === 1 ? "" : "s"} active`}
            >
              {activeCount}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4" aria-hidden />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden />
        )}
      </button>
      {open ? (
        <div id="shop-colour-filter-grid" className="mt-3">
          <ul className="flex flex-wrap gap-2">
            {visible.map((c) => {
              const isActive = activeSlugs.has(c.slug);
              const textColor = isActive ? getReadableTextOn(c.hex) : BRAND.ink;
              return (
                <li key={c.slug}>
                  <Link
                    href={buildHref(c.slug)}
                    aria-label={`Filter by colour: ${c.name}`}
                    aria-pressed={isActive}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[36px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
                    style={{
                      backgroundColor: isActive ? c.hex : "transparent",
                      color: textColor,
                      border: `2px solid ${isActive ? c.hex : BRAND.ink}`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="inline-block rounded-full"
                      style={{
                        width: 12,
                        height: 12,
                        backgroundColor: c.hex,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    {c.name}
                  </Link>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 text-xs font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
              style={{ color: BRAND.ink }}
            >
              {expanded ? "Show less" : `Show all (${chips.length})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
