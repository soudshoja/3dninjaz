import "server-only";
import { resolveProductImage } from "@/lib/product-images";
import type { PictureData, PictureSource } from "@/lib/product-images";

/**
 * Phase 7 (07-08) — manifest reader for the storefront `<picture>` shell.
 *
 * `pickImage(baseUrl)` is now a thin wrapper over `resolveProductImage` from
 * src/lib/product-images.ts, which is the single canonical read path.
 *
 * Kept for backwards compatibility: all existing callers import `pickImage`
 * from this module. The opts parameter (uploadsDir/publicPrefix) is accepted
 * but ignored — the canonical reader always uses UPLOADS_DIR / UPLOADS_PUBLIC_PREFIX
 * env vars, matching the write path.
 *
 * Returns a non-null PictureData in all cases for backwards compat:
 *   - null from resolveProductImage (stale /new/ or truly missing) → empty sources + empty fallbackSrc
 */

export type { PictureSource, PictureData };

export async function pickImage(
  baseUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts: { uploadsDir?: string; publicPrefix?: string } = {},
): Promise<PictureData> {
  if (!baseUrl) return { sources: [], fallbackSrc: "" };
  const result = await resolveProductImage(baseUrl);
  if (!result) return { sources: [], fallbackSrc: "" };
  return result;
}
