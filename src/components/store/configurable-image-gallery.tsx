"use client";

/**
 * Phase 19 (19-06) — Configurable-product image gallery.
 *
 * Hero area + thumbstrip with two modes:
 *   1. "Display" mode — shows the admin's product images (like the standard gallery).
 *   2. "Preview" mode — shows the `previewSlot` (live KeychainPreview component).
 *
 * Thumbstrip always starts with a "Yours" thumbnail (live preview) on the left,
 * followed by N thumbnails for the admin's display images.
 *
 * Parent controls the mode via `showPreview` + `onTogglePreview`.
 *
 * Tap targets ≥ 44px (RESP-01). Mobile thumbstrip is horizontally scrollable.
 *
 * Mobile: scroll-snap carousel — finger-swipe left/right. Dot indicators below
 * the images track the active slide. Arrows + thumbnail strip are desktop-only
 * (hidden md:flex). Respects prefers-reduced-motion.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import type { PictureData } from "@/lib/image-manifest";

type Props = {
  /** URL strings for admin's display images */
  displayImages: string[];
  /** Optional captions parallel to displayImages; shown as figcaption under the hero */
  imageCaptions?: (string | null | undefined)[];
  /** Optional pre-resolved PictureData parallel to displayImages (for srcset) */
  pictures?: PictureData[];
  /** When true, hero shows the live preview; when false, shows selected display image */
  showPreview: boolean;
  /** Called when user clicks "Yours" (true) or a display thumbnail (false) */
  onTogglePreview: (yours: boolean) => void;
  /** Live preview component — rendered as hero when showPreview === true.
   *  Also rendered small in the "Yours" thumbnail (unless thumbSlot is set). */
  previewSlot: React.ReactNode;
  /** Optional separate node for the thumbnail miniature; defaults to
   *  previewSlot if omitted — lets the hero and thumbnail render different
   *  components (e.g. a 3D hero vs a cheap CSS thumbnail) without mounting
   *  the hero's component twice. */
  thumbSlot?: React.ReactNode;
};

export function ConfigurableImageGallery({
  displayImages,
  imageCaptions,
  pictures,
  showPreview,
  onTogglePreview,
  previewSlot,
  thumbSlot,
}: Props) {
  // Which display image is active (index into displayImages)
  const [activeDisplayIdx, setActiveDisplayIdx] = useState(0);

  const activeCaption = imageCaptions?.[activeDisplayIdx] ?? null;

  const stripRef = useRef<HTMLUListElement>(null);
  // Index 0 = "Yours" preview thumb; 1..N = displayImages thumbs
  const thumbRefs = useRef<(HTMLLIElement | null)[]>([]);
  // Scroll-snap carousel ref (mobile)
  const slideContainerRef = useRef<HTMLDivElement>(null);
  // True when user prefers reduced motion
  const prefersReducedMotion = useRef(false);

  const sizes = "(max-width: 1024px) 100vw, 50vw";
  const thumbSizes = "80px";

  // Total slides = 1 ("Yours" preview) + displayImages.length
  const totalThumbs = 1 + displayImages.length;

  // Unified index across the strip: 0 = preview, 1..N = displayImages[i-1]
  const currentIdx = showPreview ? 0 : activeDisplayIdx + 1;
  const atStart = currentIdx === 0;
  const atEnd = currentIdx === totalThumbs - 1;

  // Pick up prefers-reduced-motion on mount (client-only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      prefersReducedMotion.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    }
  }, []);

  // When displayImages array reference changes (variant swap), reset carousel
  useEffect(() => {
    if (slideContainerRef.current) {
      slideContainerRef.current.scrollTo({ left: 0, behavior: "instant" });
    }
    setActiveDisplayIdx(0);
    onTogglePreview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayImages]);

  // Helper: scroll carousel to a unified index (0 = preview, 1..N = display images)
  function scrollToSlide(idx: number, behavior: ScrollBehavior = prefersReducedMotion.current ? "instant" : "smooth") {
    const container = slideContainerRef.current;
    if (!container) return;
    container.scrollTo({ left: idx * container.offsetWidth, behavior });
  }

  // Sync parent state from scroll position (fires after touch swipe settles)
  const handleScroll = useCallback(() => {
    const container = slideContainerRef.current;
    if (!container) return;
    const slideWidth = container.offsetWidth;
    if (slideWidth === 0) return;
    const idx = Math.round(container.scrollLeft / slideWidth);
    // Update parent + local state to match swipe destination
    if (idx === 0) {
      onTogglePreview(true);
    } else {
      const displayIdx = idx - 1;
      onTogglePreview(false);
      setActiveDisplayIdx(displayIdx);
      requestAnimationFrame(() => {
        thumbRefs.current[idx]?.scrollIntoView({
          behavior: prefersReducedMotion.current ? "instant" : "smooth",
          block: "nearest",
          inline: "center",
        });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTogglePreview]);

  // Sync carousel scroll position when parent changes showPreview / activeDisplayIdx
  // (e.g. user taps a thumbnail on desktop, or the "Yours" thumb)
  useEffect(() => {
    const container = slideContainerRef.current;
    if (!container) return;
    const targetIdx = showPreview ? 0 : activeDisplayIdx + 1;
    const slideWidth = container.offsetWidth;
    const currentScrollIdx = slideWidth > 0 ? Math.round(container.scrollLeft / slideWidth) : 0;
    if (currentScrollIdx !== targetIdx) {
      scrollToSlide(targetIdx);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, activeDisplayIdx]);

  function goTo(dir: "left" | "right") {
    const newIdx =
      dir === "left"
        ? Math.max(0, currentIdx - 1)
        : Math.min(totalThumbs - 1, currentIdx + 1);
    if (newIdx === currentIdx) return;
    if (newIdx === 0) {
      onTogglePreview(true);
    } else {
      onTogglePreview(false);
      setActiveDisplayIdx(newIdx - 1);
    }
    scrollToSlide(newIdx);
    requestAnimationFrame(() => {
      thumbRefs.current[newIdx]?.scrollIntoView({
        behavior: prefersReducedMotion.current ? "instant" : "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  }

  function goToIndex(idx: number) {
    if (idx === 0) {
      onTogglePreview(true);
    } else {
      onTogglePreview(false);
      setActiveDisplayIdx(idx - 1);
    }
    scrollToSlide(idx);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Slide container (mobile: scroll-snap carousel; desktop: single hero) ── */}
      <figure className="flex flex-col gap-1">
        <div
          className="relative rounded-[28px] overflow-hidden"
          style={{
            backgroundColor: `${BRAND.blue}10`,
            boxShadow: `inset 0 2px 8px ${BRAND.ink}08`,
          }}
        >
          <div
            ref={slideContainerRef}
            onScroll={handleScroll}
            className="flex overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
            aria-label="Product images"
            role="region"
          >
            {/* Slide 0: Live preview */}
            <div
              className="shrink-0 w-full snap-start aspect-[4/5] relative flex items-center justify-center"
              style={{ containerType: "inline-size" }}
              aria-hidden={currentIdx !== 0}
            >
              <div className="w-full h-full flex items-center justify-center">
                {previewSlot}
              </div>
            </div>

            {/* Slides 1..N: Display images */}
            {displayImages.map((img, i) => {
              const pic = pictures?.[i];
              const caption = imageCaptions?.[i] ?? null;
              return (
                <div
                  key={img + i}
                  className="shrink-0 w-full snap-start aspect-[4/5] relative"
                  aria-hidden={currentIdx !== i + 1}
                >
                  {pic && pic.sources.length > 0 ? (
                    <picture className="absolute inset-0">
                      {pic.sources.map((s) => (
                        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={sizes} />
                      ))}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pic.fallbackSrc}
                        alt={caption ?? "Product display"}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading={i === 0 ? "eager" : "lazy"}
                        fetchPriority={i === 0 ? "high" : undefined}
                      />
                    </picture>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={caption ?? "Product display"}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase 19 (19-10) — figcaption shown under hero when a caption is set (desktop) */}
        {!showPreview && activeCaption && (
          <figcaption className="hidden md:block text-xs text-slate-500 text-center mt-1 px-2">
            {activeCaption}
          </figcaption>
        )}
      </figure>

      {/* ── Dot indicators (mobile only, multi-slide only) ── */}
      {totalThumbs > 1 ? (
        <div className="flex md:hidden justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: totalThumbs }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goToIndex(i)}
              aria-label={i === 0 ? "Go to your preview" : `Go to display image ${i}`}
              className="flex items-center justify-center"
              style={{ width: 44, height: 44 }}
            >
              <span
                aria-hidden="true"
                className="rounded-full transition-all duration-200"
                style={{
                  width: i === currentIdx ? 20 : 6,
                  height: 6,
                  backgroundColor: i === currentIdx ? BRAND.blue : `${BRAND.ink}30`,
                }}
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Thumbstrip (desktop only) ── */}
      {totalThumbs > 1 ? (
        <div className="hidden md:flex items-center gap-1 -mx-2 px-2">
          {/* Left arrow — previous thumb */}
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

          <ul
            ref={stripRef}
            className="flex gap-3 overflow-x-auto flex-1"
            aria-label="Product image thumbnails"
            style={{ scrollbarWidth: "none" }}
          >
            {/* "Yours" thumbnail — always first */}
            <li
              ref={(el) => {
                thumbRefs.current[0] = el;
              }}
            >
              <button
                type="button"
                onClick={() => onTogglePreview(true)}
                aria-label="Show your live preview"
                aria-current={showPreview ? "true" : undefined}
                className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-200 flex flex-col items-center justify-center gap-1 cursor-pointer"
                style={{
                  borderColor: showPreview ? BRAND.green : "transparent",
                  backgroundColor: `${BRAND.green}15`,
                  boxShadow: showPreview ? `0 0 0 2px ${BRAND.green}40, 0 3px 0 ${BRAND.greenDark}40` : "0 2px 4px rgba(0,0,0,0.06)",
                  minHeight: 44,
                  minWidth: 44,
                }}
              >
                {/* Small live preview miniature */}
                <div
                  className="relative w-14 h-14 overflow-hidden"
                  aria-hidden="true"
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%) scale(0.2)",
                      transformOrigin: "center center",
                      width: "500%",
                    }}
                  >
                    {thumbSlot ?? previewSlot}
                  </div>
                </div>
                <span
                  className="absolute bottom-1 text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: showPreview ? BRAND.ink : "#64748b" }}
                >
                  Name
                </span>
              </button>
            </li>

            {/* Display image thumbnails */}
            {displayImages.map((img, i) => {
              const tp = pictures?.[i];
              const isActive = !showPreview && activeDisplayIdx === i;
              return (
                <li
                  key={img + i}
                  ref={(el) => {
                    thumbRefs.current[i + 1] = el;
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDisplayIdx(i);
                      onTogglePreview(false);
                    }}
                    aria-label={`View display image ${i + 1}`}
                    aria-current={isActive ? "true" : undefined}
                    className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-200 cursor-pointer"
                    style={{
                      borderColor: isActive ? BRAND.blue : "transparent",
                      backgroundColor: `${BRAND.blue}10`,
                      boxShadow: isActive ? `0 0 0 2px ${BRAND.blue}40, 0 3px 0 ${BRAND.blueDark}40` : "0 2px 4px rgba(0,0,0,0.06)",
                      minHeight: 44,
                      minWidth: 44,
                    }}
                  >
                    {tp && tp.sources.length > 0 ? (
                      <picture>
                        {tp.sources.map((s) => (
                          <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={thumbSizes} />
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

          {/* Right arrow — next thumb */}
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
