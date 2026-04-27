import "server-only";

/**
 * Phase 19 (19-10) — Server component that resolves a product image manifest
 * and renders a `<picture>` element with AVIF + WebP + JPEG srcset for
 * configurable product PDPs.
 *
 * Used by:
 *   - ConfigurableImageGallery (via pre-resolved PictureData from the PDP server page)
 *   - Any server-rendered surface that has a baseUrl and needs a responsive image
 *
 * Falls back to a plain <img> when manifest.json is missing (older uploads or
 * images that haven't been reprocessed through the Phase 7 Sharp pipeline).
 *
 * Sizes attribute "(min-width: 768px) 600px, 100vw" is tuned for PDP hero use.
 * Pass a smaller sizes value for thumbstrip use.
 */

import { pickImage } from "@/lib/image-manifest";

type Props = {
  /** Base URL pointing to the image dir — pickImage reads manifest.json from here */
  baseUrl: string;
  /** Displayed as <figcaption> text and img alt fallback */
  caption?: string | null;
  /** img alt text — takes priority over caption */
  alt?: string | null;
  className?: string;
  /**
   * PDP hero = "eager" (LCP — loaded immediately).
   * Thumbstrip / below-fold = "lazy".
   */
  loading?: "eager" | "lazy";
  /**
   * sizes attribute for the browser's image width selection.
   * Defaults to hero size "(min-width: 768px) 600px, 100vw".
   * Pass "80px" for thumbstrip use.
   */
  sizes?: string;
};

export async function ConfigurableProductPicture({
  baseUrl,
  caption,
  alt,
  className,
  loading = "lazy",
  sizes = "(min-width: 768px) 600px, 100vw",
}: Props) {
  if (!baseUrl) return null;

  const data = await pickImage(baseUrl);
  const altText = alt ?? caption ?? "";

  // No manifest / legacy file URL — plain img fallback
  if (!data || data.sources.length === 0) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={data?.fallbackSrc ?? baseUrl}
        alt={altText}
        className={className}
        loading={loading}
        decoding="async"
      />
    );
  }

  return (
    <picture>
      {data.sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={sizes} />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.fallbackSrc}
        alt={altText}
        className={className}
        loading={loading}
        decoding="async"
        fetchPriority={loading === "eager" ? "high" : undefined}
      />
    </picture>
  );
}
