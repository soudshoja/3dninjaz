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

import { useState } from "react";
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

  const sizes = "(max-width: 1024px) 100vw, 50vw";
  const thumbSizes = "80px";

  return (
    <div className="flex flex-col gap-4">
      {/* ── Hero area ── */}
      <figure className="flex flex-col gap-1">
      <div
        className="relative aspect-square rounded-[28px] overflow-hidden flex items-center justify-center"
        style={{
          backgroundColor: `${BRAND.blue}10`,
          boxShadow: `inset 0 2px 8px ${BRAND.ink}08`,
        }}
      >
        {showPreview ? (
          /* Live preview mode */
          <div className="w-full h-full flex items-center justify-center p-8">
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
      <ul
        className="flex gap-3 overflow-x-auto -mx-2 px-2"
        aria-label="Product image thumbnails"
        style={{ scrollbarWidth: "none" }}
      >
        {/* "Yours" thumbnail — always first */}
        <li>
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
              className="w-14 h-14 flex items-center justify-center overflow-hidden"
              aria-hidden="true"
            >
              <div style={{ transform: "scale(0.4)", transformOrigin: "center center", width: "200%", height: "200%" }}>
                {previewSlot}
              </div>
            </div>
            <span
              className="absolute bottom-1 text-[9px] font-bold uppercase tracking-wide"
              style={{ color: showPreview ? BRAND.ink : "#64748b" }}
            >
              Yours
            </span>
          </button>
        </li>

        {/* Display image thumbnails */}
        {displayImages.map((img, i) => {
          const tp = pictures?.[i];
          const isActive = !showPreview && activeDisplayIdx === i;
          return (
            <li key={img + i}>
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
    </div>
  );
}
