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
  const hasImages = images.length > 0;
  const activePic = pictures?.[activeIndex];
  const activeImage = hasImages ? images[activeIndex] : null;
  const sizes = "(max-width: 1024px) 100vw, 50vw";
  const thumbSizes = "80px";

  function scrollStrip(dir: "left" | "right") {
    stripRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
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
          {/* Left scroll arrow */}
          <button
            type="button"
            onClick={() => scrollStrip("left")}
            aria-label="Scroll thumbnails left"
            className="shrink-0 flex items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition hover:bg-zinc-50 active:scale-95 z-10"
            style={{ width: 40, height: 40, minWidth: 40, color: BRAND.ink }}
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
                <li key={img + i}>
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

          {/* Right scroll arrow */}
          <button
            type="button"
            onClick={() => scrollStrip("right")}
            aria-label="Scroll thumbnails right"
            className="shrink-0 flex items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition hover:bg-zinc-50 active:scale-95 z-10"
            style={{ width: 40, height: 40, minWidth: 40, color: BRAND.ink }}
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
