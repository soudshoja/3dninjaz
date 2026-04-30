import "server-only";
import { sanitizeRichText } from "@/lib/rich-text-sanitizer";

/**
 * Quick task 260430-kmr — Server-only helper that renders a `products.description`
 * column for storefront PDPs. The column is plain `text` and may hold either:
 *   - legacy plain-text descriptions (no HTML tags), entered before the Quill
 *     description editor shipped, or
 *   - new HTML descriptions emitted by Quill via the admin edit form
 *     (already sanitised at the products.ts server-action boundary).
 *
 * Auto-detection rule (D-3): if `raw.trimStart()` starts with `<` we treat the
 * value as HTML and pass it through `sanitizeRichText()` (defence-in-depth).
 * Otherwise we treat it as plain text — paragraph breaks (\n\n+) become `<p>`
 * blocks, single newlines inside a paragraph become `<br />`, and every chunk
 * is HTML-entity-escaped so legacy plain text is rendered identically to what
 * the admin originally typed.
 *
 * Empty / null / undefined input → empty string. The PDP root component falls
 * back to its legacy inline render in that case (so missing data never blows
 * up the page).
 *
 * IMPORTANT: this module is server-only. The Quill class-hook CSS rules
 * applied by `<DescriptionDisplay>` MUST stay in sync with the allowlist in
 * `src/lib/rich-text-sanitizer.ts` — sanitiser changes mean both files update.
 */

const ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ENTITY_MAP[ch] ?? ch);
}

export function renderDescription(raw: string | null | undefined): string {
  if (!raw) return "";

  const trimmed = raw.trimStart();
  if (trimmed.startsWith("<")) {
    return sanitizeRichText(raw);
  }

  // Plain-text path: split on paragraph breaks, escape, swap single \n for <br />.
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  if (paragraphs.length === 0) return "";

  return paragraphs
    .map((chunk) => `<p>${escapeHtml(chunk).replace(/\n/g, "<br />")}</p>`)
    .join("");
}
