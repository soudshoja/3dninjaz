"use client";

import { useState, useRef } from "react";
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
  const hasImages = images.length > 0;
  const activePic = pictures?.[activeIndex];
  const activeImage = hasImages ? images[activeIndex] : null;
  const sizes = "(max-width: 1024px) 100vw, 50vw";
  const thumbSizes = "80px";

  const atStart = activeIndex === 0;
  const atEnd = activeIndex === images.length - 1;

  function goTo(dir: "left" | "right") {
    const newIdx =
      dir === "left"
        ? Math.max(0, activeIndex - 1)
        : Math.min(images.length - 1, activeIndex + 1);
    if (newIdx === activeIndex) return;
    setActiveIndex(newIdx);
    // Defer to next frame so the active thumb's updated styles settle before scroll
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
      <div
        className="relative aspect-square rounded-[28px] overflow-hidden shadow-lg"
        style={{ backgroundColor: `${BRAND.blue}15` }}
      >
        {activeImage ? (
          activePic && activePic.sources.length > 0 ? (
            <picture>
              {activePic.sources.map((s) => (
                <source
                  key={s.type}
                  type={s.type}
                  srcSet={s.srcSet}
                  sizes={sizes}
                />
              ))}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activePic.fallbackSrc}
                alt={alt}
                className="absolute inset-0 h-full w-full object-cover"
                fetchPriority="high"
              />
            </picture>
          ) : (
            // Legacy fallback
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeImage}
              alt={alt}
              className="absolute inset-0 h-full w-full object-cover"
              fetchPriority="high"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-500">
            No image available
          </div>
        )}

      </div>
      {images.length > 1 ? (
        <div className="relative flex items-center gap-1 -mx-2 px-2">
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
                    onClick={() => setActiveIndex(i)}
                    aria-label={`View image ${i + 1} of ${images.length}`}
                    aria-current={i === activeIndex ? "true" : undefined}
                    className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-200 cursor-pointer min-h-[48px] min-w-[48px]"
                    style={{
                      borderColor: i === activeIndex ? BRAND.blue : "transparent",
                      backgroundColor: `${BRAND.blue}10`,
                      boxShadow: i === activeIndex
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
