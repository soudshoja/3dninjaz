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
 */

import { useState, useRef } from "react";
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
   *  Also rendered small in the "Yours" thumbnail. */
  previewSlot: React.ReactNode;
};

export function ConfigurableImageGallery({
  displayImages,
  imageCaptions,
  pictures,
  showPreview,
  onTogglePreview,
  previewSlot,
}: Props) {
  // Which display image is active (index into displayImages)
  const [activeDisplayIdx, setActiveDisplayIdx] = useState(0);

  const activePic = pictures?.[activeDisplayIdx];
  const activeDisplayImage = displayImages[activeDisplayIdx] ?? null;
  const activeCaption = imageCaptions?.[activeDisplayIdx] ?? null;

  const stripRef = useRef<HTMLUListElement>(null);
  // Index 0 = "Yours" preview thumb; 1..N = displayImages thumbs
  const thumbRefs = useRef<(HTMLLIElement | null)[]>([]);

  const sizes = "(max-width: 1024px) 100vw, 50vw";
  const thumbSizes = "80px";

  // Total thumbs = 1 ("Yours") + displayImages.length
  const totalThumbs = 1 + displayImages.length;

  // Unified index across the strip: 0 = preview, 1..N = displayImages[i-1]
  const currentIdx = showPreview ? 0 : activeDisplayIdx + 1;
  const atStart = currentIdx === 0;
  const atEnd = currentIdx === totalThumbs - 1;

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
    requestAnimationFrame(() => {
      thumbRefs.current[newIdx]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Hero area ── */}
      <figure className="flex flex-col gap-1">
      <div
        className="relative aspect-square rounded-[28px] flex items-center justify-center"
        style={{
          backgroundColor: `${BRAND.blue}10`,
          boxShadow: `inset 0 2px 8px ${BRAND.ink}08`,
          containerType: "inline-size",
          /* overflow-hidden only when showing images so the image fills the
             rounded square; in preview mode we allow the ring tab to overflow
             slightly left without clipping. */
          overflow: showPreview ? "visible" : "hidden",
        }}
      >
        {showPreview ? (
          /* Live preview mode — previewSlot uses 100cqw which resolves to this
             container's width, so cubes auto-size to fit the hero square. */
          <div className="w-full h-full flex items-center justify-center">
            {previewSlot}
          </div>
        ) : activeDisplayImage ? (
          /* Display image mode — with srcset if available */
          activePic && activePic.sources.length > 0 ? (
            <picture className="absolute inset-0">
              {activePic.sources.map((s) => (
                <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={sizes} />
              ))}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activePic.fallbackSrc}
                alt={activeCaption ?? "Product display"}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
                fetchPriority="high"
              />
            </picture>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeDisplayImage}
              alt={activeCaption ?? "Product display"}
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-400">
            No image available
          </div>
        )}

      </div>
      {/* Phase 19 (19-10) — figcaption shown under hero when a caption is set */}
      {!showPreview && activeCaption && (
        <figcaption className="text-xs text-slate-500 text-center mt-1 px-2">
          {activeCaption}
        </figcaption>
      )}
      </figure>

      {/* ── Thumbstrip ── */}
      {totalThumbs > 1 ? (
        <div className="relative flex items-center gap-1 -mx-2 px-2">
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
                    {previewSlot}
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
