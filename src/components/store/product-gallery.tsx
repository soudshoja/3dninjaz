"use client";

import Image from "next/image";
import { useState } from "react";
import { BRAND } from "@/lib/brand";

/**
 * PDP image gallery. One main image (1:1, priority-loaded) with a horizontal
 * thumbnail strip that swaps on click. State is purely local — the parent
 * component doesn't care which image is active.
 */
export function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const hasImages = images.length > 0;
  const activeImage = hasImages ? images[activeIndex] : null;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative aspect-square rounded-[28px] overflow-hidden shadow-lg"
        style={{ backgroundColor: `${BRAND.blue}15` }}
      >
        {activeImage ? (
          <Image
            src={activeImage}
            alt={alt}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-500">
            No image available
          </div>
        )}
      </div>
      {images.length > 1 ? (
        <ul
          className="flex gap-3 overflow-x-auto -mx-2 px-2"
          aria-label="Product image thumbnails"
        >
          {images.map((img, i) => (
            <li key={img + i}>
              <button
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`View image ${i + 1} of ${images.length}`}
                aria-current={i === activeIndex ? "true" : undefined}
                className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition min-h-[48px] min-w-[48px]"
                style={{
                  borderColor: i === activeIndex ? BRAND.ink : "transparent",
                  backgroundColor: `${BRAND.green}10`,
                }}
              >
                <Image src={img} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
