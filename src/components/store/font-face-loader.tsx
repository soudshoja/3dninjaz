/**
 * FontFaceLoader — server component.
 *
 * Fetches active custom fonts from the DB and emits:
 *   1. @font-face declarations (so the browser downloads only the used fonts)
 *   2. .ql-font-<slug> CSS rules for the Quill editor output layer
 *   3. Quill picker label/item rules so the font name appears in the dropdown
 *
 * Placed in both the admin layout and the storefront layout so:
 *   - The Quill editor in /admin/products/{id}/edit sees the fonts
 *   - The storefront PDP DescriptionDisplay / TextareaDisplay renders them
 *
 * Failure-safe: if the DB fetch throws, renders nothing (no <style> block).
 *
 * Security: all CSS values (familySlug, fileUrl, displayName) originate from
 * admin-written DB rows — validated and sanitised at upload time. The slugs
 * are [a-z0-9-] only (enforced by toFamilySlug in the upload route); the
 * fileUrl is constructed server-side from a sanitised filename + UUID path;
 * the displayName is a short admin-entered string (max 64 chars). None are
 * user-supplied from the storefront. The __html prop is an acceptable
 * escape hatch here under the same rationale as rich-text-sanitizer.ts.
 */

import { getActiveCustomFontsForLoader } from "@/actions/custom-fonts";

/** Escape CSS string context (single-quoted values like font-family names and content). */
function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Allow only safe characters in a CSS identifier (slug). */
function safeCssIdent(slug: string): string {
  return slug.replace(/[^a-z0-9-]/g, "");
}

/** Allow only safe characters in a URL (already validated path). */
function safeCssUrl(url: string): string {
  // fileUrl is server-generated: /uploads/fonts/<uuid>/<file>
  // Reject anything with quotes or parens to be safe.
  return url.replace(/['"()]/g, "");
}

export async function FontFaceLoader() {
  let fonts: { familySlug: string; fileUrl: string; displayName: string }[] = [];
  try {
    fonts = await getActiveCustomFontsForLoader();
  } catch {
    // DB unavailable — skip font injection silently
    return null;
  }

  if (fonts.length === 0) return null;

  const css = fonts
    .map(({ familySlug, fileUrl, displayName }) => {
      const slug = safeCssIdent(familySlug);
      const url = safeCssUrl(fileUrl);
      const name = escapeCssString(displayName);
      const format = fileUrl.endsWith(".woff2") ? "woff2" : "woff";
      return [
        `@font-face{font-family:'${slug}';src:url('${url}')format('${format}');font-display:swap}`,
        `.ql-font-${slug},.ql-output .ql-font-${slug}{font-family:'${slug}',system-ui,sans-serif}`,
        `.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="${slug}"]::before{content:'${name}';font-family:'${slug}',system-ui,sans-serif}`,
        `.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="${slug}"]::before{content:'${name}';font-family:'${slug}',system-ui,sans-serif}`,
      ].join("\n");
    })
    .join("\n");

  // Security: css is assembled entirely from server-generated values
  // (slug = [a-z0-9-] only; url = server path with quotes stripped;
  // name = admin displayName with CSS string escaping applied).
  // This is the same pattern as the rich-text allowlist sanitiser — the
  // security boundary is the upload route, not the consumer.
  const props = { dangerouslySetInnerHTML: { __html: css } };
  return <style {...props} />;
}
