"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * PDP image gallery. One main image (1:1, priority-loaded) with a horizontal
 * thumbnail strip that swaps on click. State is purely local — the parent
 * component doesn't care which image is active.
 *
 * Phase 7 (07-08): switched from next/Image to plain `<picture>` with
 * server-resolved srcset (avif/webp/jpeg). Parent passes pre-resolved
 * `pictures` PictureData[] from src/lib/image-manifest.ts. Legacy URLs
 * fall through to a single <img>.
 *
 * Mobile / tablet: scroll-snap carousel — finger-swipe left/right. Dot
 * indicators below the images track the active slide. Arrow buttons and
 * thumbnail strip are desktop-only (md:flex).
 * Respects `prefers-reduced-motion: reduce` — skips smooth scroll.
 */

type PictureSource = {
  type: "image/avif" | "image/webp" | "image/jpeg";
  srcSet: string;
};

type PictureData = {
  sources: PictureSource[];
  fallbackSrc: string;
};

export function ProductGallery({
  images,
  pictures,
  alt,
}: {
  images: string[];
  /** Phase 7 (07-08) — pre-resolved manifests, indexed parallel to images. */
  pictures?: PictureData[];
  alt: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const stripRef = useRef<HTMLUListElement>(null);
  const thumbRefs = useRef<(HTMLLIElement | null)[]>([]);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  // True when the user prefers reduced motion
  const prefersReducedMotion = useRef(false);
  const hasImages = images.length > 0;
  const sizes = "(max-width: 1024px) 100vw, 50vw";
  const thumbSizes = "80px";

  // Pick up prefers-reduced-motion on mount (client-only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      prefersReducedMotion.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    }
  }, []);

  // When activeIndex changes externally (variant swap re-renders with new images
  // array where the variant image is prepended at index 0), reset the carousel
  // scroll position to the start.
  useEffect(() => {
    if (slideContainerRef.current) {
      slideContainerRef.current.scrollTo({ left: 0, behavior: "instant" });
    }
    setActiveIndex(0);
    // Only run when the images array reference changes (variant swap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  // Sync activeIndex from scroll position (fires after touch swipe settles)
  const handleScroll = useCallback(() => {
    const container = slideContainerRef.current;
    if (!container) return;
    const slideWidth = container.offsetWidth;
    if (slideWidth === 0) return;
    const idx = Math.round(container.scrollLeft / slideWidth);
    setActiveIndex((prev) => {
      if (prev === idx) return prev;
      // Also keep thumbnail strip in sync
      requestAnimationFrame(() => {
        thumbRefs.current[idx]?.scrollIntoView({
          behavior: prefersReducedMotion.current ? "instant" : "smooth",
          block: "nearest",
          inline: "center",
        });
      });
      return idx;
    });
  }, []);

  function goTo(dir: "left" | "right") {
    const newIdx =
      dir === "left"
        ? Math.max(0, activeIndex - 1)
        : Math.min(images.length - 1, activeIndex + 1);
    if (newIdx === activeIndex) return;

    // Scroll the slide container to the target slide
    const container = slideContainerRef.current;
    if (container) {
      container.scrollTo({
        left: newIdx * container.offsetWidth,
        behavior: prefersReducedMotion.current ? "instant" : "smooth",
      });
    }

    setActiveIndex(newIdx);
    requestAnimationFrame(() => {
      thumbRefs.current[newIdx]?.scrollIntoView({
        behavior: prefersReducedMotion.current ? "instant" : "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  }

  function goToIndex(i: number) {
    const container = slideContainerRef.current;
    if (container) {
      container.scrollTo({
        left: i * container.offsetWidth,
        behavior: prefersReducedMotion.current ? "instant" : "smooth",
      });
    }
    setActiveIndex(i);
  }

  const atStart = activeIndex === 0;
  const atEnd = activeIndex === images.length - 1;

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      {/* ── Slide container (mobile: scroll-snap; desktop: single visible) ── */}
      <div
        className="relative rounded-[28px] overflow-hidden shadow-lg"
        style={{ backgroundColor: `${BRAND.blue}15` }}
      >
        <div
          ref={slideContainerRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory"
          style={{
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
          }}
          aria-label="Product images"
          role="region"
        >
          {hasImages ? (
            images.map((img, i) => {
              const pic = pictures?.[i];
              return (
                <div
                  key={img + i}
                  className="shrink-0 w-full snap-start aspect-[4/5] relative"
                  aria-hidden={i !== activeIndex}
                >
                  {pic && pic.sources.length > 0 ? (
                    <picture>
                      {pic.sources.map((s) => (
                        <source
                          key={s.type}
                          type={s.type}
                          srcSet={s.srcSet}
                          sizes={sizes}
                        />
                      ))}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pic.fallbackSrc}
                        alt={i === 0 ? alt : ""}
                        className="absolute inset-0 h-full w-full object-cover"
                        fetchPriority={i === 0 ? "high" : undefined}
                        loading={i === 0 ? undefined : "lazy"}
                      />
                    </picture>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={i === 0 ? alt : ""}
                      className="absolute inset-0 h-full w-full object-cover"
                      fetchPriority={i === 0 ? "high" : undefined}
                      loading={i === 0 ? undefined : "lazy"}
                    />
                  )}
                </div>
              );
            })
          ) : (
            <div
              className="shrink-0 w-full snap-start aspect-[4/5] flex items-center justify-center text-slate-500"
            >
              No image available
            </div>
          )}
        </div>
      </div>

      {/* ── Dot indicators (mobile only, multi-image only) ── */}
      {images.length > 1 ? (
        <div className="flex md:hidden justify-center gap-1.5" aria-hidden="true">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goToIndex(i)}
              aria-label={`Go to image ${i + 1}`}
              className="rounded-full transition-all duration-200"
              style={{
                width: i === activeIndex ? 20 : 7,
                height: 7,
                backgroundColor:
                  i === activeIndex ? BRAND.blue : `${BRAND.ink}30`,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* ── Arrows + thumbnail strip (desktop only) ── */}
      {images.length > 1 ? (
        <div className="hidden md:flex items-center gap-1 -mx-2 px-2">
          {/* Left arrow — previous image */}
          <button
            type="button"
            onClick={() => goTo("left")}
            disabled={atStart}
            aria-disabled={atStart}
            aria-label="Previous image"
            className="shrink-0 flex items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition active:scale-95 z-10 enabled:hover:bg-zinc-50"
            style={{
              width: 40,
              height: 40,
              minWidth: 40,
              color: BRAND.ink,
              opacity: atStart ? 0.35 : 1,
              cursor: atStart ? "not-allowed" : "pointer",
            }}
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>

          {/* Scrollable thumbnail strip */}
          <ul
            ref={stripRef}
            className="flex gap-3 overflow-x-auto flex-1"
            aria-label="Product image thumbnails"
            style={{ scrollbarWidth: "none" }}
          >
            {images.map((img, i) => {
              const tp = pictures?.[i];
              return (
                <li
                  key={img + i}
                  ref={(el) => {
                    thumbRefs.current[i] = el;
                  }}
                >
                  <button
                    type="button"
                    onClick={() => goToIndex(i)}
                    aria-label={`View image ${i + 1} of ${images.length}`}
                    aria-current={i === activeIndex ? "true" : undefined}
                    className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-200 cursor-pointer min-h-[48px] min-w-[48px]"
                    style={{
                      borderColor: i === activeIndex ? BRAND.blue : "transparent",
                      backgroundColor: `${BRAND.blue}10`,
                      boxShadow:
                        i === activeIndex
                          ? `0 0 0 2px ${BRAND.blue}40, 0 3px 0 ${BRAND.blueDark}40`
                          : "0 2px 4px rgba(0,0,0,0.06)",
                    }}
                  >
                    {tp && tp.sources.length > 0 ? (
                      <picture>
                        {tp.sources.map((s) => (
                          <source
                            key={s.type}
                            type={s.type}
                            srcSet={s.srcSet}
                            sizes={thumbSizes}
                          />
                        ))}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={tp.fallbackSrc}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                        />
                      </picture>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Right arrow — next image */}
          <button
            type="button"
            onClick={() => goTo("right")}
            disabled={atEnd}
            aria-disabled={atEnd}
            aria-label="Next image"
            className="shrink-0 flex items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition active:scale-95 z-10 enabled:hover:bg-zinc-50"
            style={{
              width: 40,
              height: 40,
              minWidth: 40,
              color: BRAND.ink,
              opacity: atEnd ? 0.35 : 1,
              cursor: atEnd ? "not-allowed" : "pointer",
            }}
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
