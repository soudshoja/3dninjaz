import "server-only";
import { pickImage } from "@/lib/image-manifest";

/**
 * Phase 7 (07-08) — responsive product image (`<picture>` shell).
 *
 * Server component (async). Reads the manifest from disk, emits 3 sources
 * (avif/webp/jpeg) for the new directory shape; falls back to a single
 * <img> for legacy URLs. Caller passes the base URL stored in
 * products.images[i] (or any /uploads/... path).
 *
 * `eager` set to true on the LCP candidate (e.g. PDP hero) so the browser
 * starts the request before lazy-load kicks in.
 */
export async function ResponsiveProductImage({
  imageUrl,
  alt,
  sizes = "(max-width: 768px) 100vw, 33vw",
  className,
  eager,
}: {
  imageUrl: string;
  alt: string;
  sizes?: string;
  className?: string;
  eager?: boolean;
}) {
  const data = await pickImage(imageUrl);
  if (data.sources.length === 0) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.fallbackSrc}
        alt={alt}
        className={className}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    );
  }
  return (
    <picture>
      {data.sources.map((s) => (
        <source
          key={s.type}
          type={s.type}
          srcSet={s.srcSet}
          sizes={sizes}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.fallbackSrc}
        alt={alt}
        className={className}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}
