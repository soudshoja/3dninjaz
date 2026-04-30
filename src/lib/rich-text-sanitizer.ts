import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Quick task 260430-icx — Rich-text sanitiser for `textarea` config-field HTML.
 *
 * Allowlist matches the Quill toolbar surface (Word-style ribbon):
 *   bold, italic, underline, strikethrough, foreground/background colour,
 *   font-family + font-size, alignment (left/center/right/justify),
 *   ordered/unordered lists with indentation, blockquote, headings h1-h3,
 *   paragraphs, line breaks, inline links.
 *
 * Quill emits class names (e.g. ql-align-center, ql-indent-1, ql-font-serif,
 * ql-size-small) AND inline styles depending on which formatter is configured.
 * We allow both so the rendered admin output matches what the editor showed.
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
    "blockquote",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style", "class"],
    p: ["class", "style"],
    h1: ["class", "style"],
    h2: ["class", "style"],
    h3: ["class", "style"],
    li: ["class", "style"],
    ol: ["class", "style"],
    ul: ["class", "style"],
    blockquote: ["class", "style"],
    "*": ["style"],
  },
  allowedClasses: {
    "*": [
      // Quill alignment + indent + font + size class hooks
      /^ql-align-(left|right|center|justify)$/,
      /^ql-indent-([1-8])$/,
      /^ql-font-[a-z-]+$/,
      /^ql-size-(small|large|huge)$/,
      /^ql-direction-rtl$/,
    ],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedStyles: {
    "*": {
      "font-family": [/^[A-Za-z0-9 ,'"\-]+$/],
      "font-weight": [/^(normal|bold|[1-9]00)$/],
      "text-decoration": [/^(none|underline|line-through)$/],
      "text-align": [/^(left|right|center|justify)$/],
      // Quill colour pickers emit hex / rgb / rgba values inline
      color: [
        /^#(?:[0-9a-fA-F]{3}){1,2}$/,
        /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
        /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/,
      ],
      "background-color": [
        /^#(?:[0-9a-fA-F]{3}){1,2}$/,
        /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
        /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/,
      ],
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
