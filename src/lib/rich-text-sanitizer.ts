import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Quick task 260430-icx — Rich-text sanitiser for `textarea` config-field HTML.
 *
 * Allowlist matches the Novel bubble menu features:
 *   bold, italic, underline, strikethrough, ordered/unordered lists,
 *   headings h1-h3, paragraphs, line breaks, inline links.
 *
 * Inline style allowlist is limited to font-family, font-weight,
 * text-decoration, and text-align — same set the Novel editor exposes.
 *
 * IMPORTANT: this module is server-only (the bare `sanitize-html` package
 * is CommonJS and depends on Node-only `domhandler` parsing). Importing
 * from a client module will fail at build time. Sanitisation runs at the
 * server boundary on every save path — defence-in-depth.
 *
 * `isomorphic-dompurify` is BANNED (broke prod previously per CLAUDE.md
 * "Pivots & Production Quirks").
 *
 * Run on EVERY admin save path that persists a textarea field's html.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "h1",
    "h2",
    "h3",
    "strong",
    "em",
    "u",
    "s",
    "ol",
    "ul",
    "li",
    "a",
    "br",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    "*": ["style"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedStyles: {
    "*": {
      "font-family": [/^[A-Za-z0-9 ,'"\-]+$/],
      "font-weight": [/^(normal|bold|[1-9]00)$/],
      "text-decoration": [/^(none|underline|line-through)$/],
      "text-align": [/^(left|right|center|justify)$/],
    },
  },
  // Rewrite all anchors to open safely in a new tab.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    }),
  },
};

export function sanitizeRichText(html: string): string {
  if (typeof html !== "string") return "";
  return sanitizeHtml(html, OPTIONS);
}
