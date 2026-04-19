import "server-only";
import DOMPurify from "isomorphic-dompurify";

// ============================================================================
// Plan 05-06 — DOMPurify config for transactional email HTML.
//
// Allowed tags + attrs are tuned for safe email markup. Inline event
// handlers (onerror, onclick, etc) are explicitly forbidden. data:* attrs
// are rejected entirely.
//
// Variable substitution (in src/lib/email/templates.ts) HTML-escapes every
// non-HTML variable; only the explicitly-marked HTML_VARS pass through
// sanitiseEmailHtml without escaping (e.g. items_table renders pre-built
// <tr><td>...</td></tr> rows from the order data).
// ============================================================================

const ALLOWED_TAGS = [
  "a",
  "b",
  "br",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "target",
  "rel",
  "style",
  "width",
  "height",
  "align",
  "cellpadding",
  "cellspacing",
  "border",
  "bgcolor",
  "colspan",
  "rowspan",
];

const FORBID_ATTR = [
  "onerror",
  "onload",
  "onclick",
  "onmouseover",
  "onfocus",
  "onblur",
  "onsubmit",
  "onmouseout",
  "onkeydown",
  "onkeyup",
  "onkeypress",
];

export function sanitiseEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * HTML-escape a value for safe inclusion in template substitution. Used
 * for every variable except the explicitly-marked HTML_VARS in templates.ts.
 */
export function escapeHtml(v: unknown): string {
  const s = String(v ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
