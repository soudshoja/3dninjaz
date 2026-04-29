/**
 * Phase 18 — pure colour slug helpers (NO DB imports).
 *
 * Lives in its own module so client components (e.g. colour-form.tsx) can
 * import these helpers without webpack pulling in mysql2 / Drizzle / node:*
 * APIs through the DB-aware helpers in src/lib/colours.ts.
 *
 * Slug derivation per D-14 (lowercase + hyphenate, no slug column).
 * Cross-brand collisions resolved at map-build time by appending a
 * `-<lowerbrand>` suffix to ALL ids that share a base slug.
 */

/**
 * Lowercase + hyphenate a colour name. Mirrors src/actions/products.ts
 * `slugify`. Returns the base slug WITHOUT brand suffix; collision handling
 * lives in `buildColourSlugMap`.
 */
export function slugifyColourBase(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Build colour-id → slug map with collision suffixing.
 * If two or more rows share a base slug (e.g. Bambu "Black" + Polymaker
 * "Black"), ALL rows get `-<lowerbrand>` suffix. Pure function — call this
 * on a list of colours fetched once.
 */
export function buildColourSlugMap(
  colourList: { id: string; name: string; brand: string }[],
): Map<string, string> {
  const baseToIds = new Map<string, string[]>();
  for (const c of colourList) {
    const base = slugifyColourBase(c.name);
    baseToIds.set(base, [...(baseToIds.get(base) ?? []), c.id]);
  }
  const idToSlug = new Map<string, string>();
  for (const c of colourList) {
    const base = slugifyColourBase(c.name);
    const ids = baseToIds.get(base)!;
    if (ids.length === 1) {
      idToSlug.set(c.id, base);
    } else {
      idToSlug.set(c.id, `${base}-${c.brand.toLowerCase()}`);
    }
  }
  return idToSlug;
}
