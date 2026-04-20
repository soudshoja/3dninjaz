import "server-only";

// ============================================================================
// Plan 05-06 — Allowlist-based sanitizer for transactional email HTML.
//
// Previously this used `isomorphic-dompurify`, which transitively pulls in
// `jsdom` + `html-encoding-sniffer@6` + `@exodus/bytes` (pure ESM). Under
// Next.js 15 + Node 20 in production the CommonJS bundle that Next's server
// runtime produces fails to require that ESM dep and crashes the whole
// /admin/email-templates page with ERR_REQUIRE_ESM.
//
// We replaced DOMPurify with a small tag+attribute allowlist stripper here.
// It is safe for our use because:
//   1) only admins (requireAdmin) can author the template HTML
//   2) all variable values are escaped via escapeHtml before substitution
//   3) the renderer sanitises a second time at render time (defense in depth)
//   4) we strip every tag that is not in ALLOWED_TAGS — including <script>,
//      <style>, <iframe>, <object>, <embed>, <link>, <meta>, <base>, <form>
//   5) we strip every attribute that is not in ALLOWED_ATTR — including all
//      on* event handlers, srcset, formaction, etc.
//   6) href/src values that start with javascript:, vbscript:, data:, or
//      file: are dropped entirely.
//
// Public API (sanitiseEmailHtml, escapeHtml) matches the previous version.
// ============================================================================

const ALLOWED_TAGS = new Set([
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
]);

const ALLOWED_ATTR = new Set([
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
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

const URL_ATTRS = new Set(["href", "src"]);

/** Reject javascript:/vbscript:/data:/file: URLs in href/src. */
function isSafeUrl(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("javascript:")) return false;
  if (v.startsWith("vbscript:")) return false;
  if (v.startsWith("data:")) return false;
  if (v.startsWith("file:")) return false;
  return true;
}

/** Parse attributes out of the inside of a tag, applying the allowlist. */
function sanitiseAttrs(raw: string): string {
  // Match name="value", name='value', or bare name
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    if (!ALLOWED_ATTR.has(name)) continue;
    const rawValue = m[2] ?? m[3] ?? m[4] ?? "";
    if (URL_ATTRS.has(name) && rawValue && !isSafeUrl(rawValue)) continue;
    // Escape any " in value and always quote with "
    const safeValue = rawValue
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    out.push(`${name}="${safeValue}"`);
  }
  return out.length ? " " + out.join(" ") : "";
}

/**
 * Tag-and-attribute allowlist sanitizer. Everything outside the allowlist
 * is dropped. Text nodes are preserved as-is (caller is expected to have
 * already HTML-escaped any untrusted variable values before substitution).
 */
export function sanitiseEmailHtml(html: string): string {
  if (!html) return "";

  // Strip HTML comments (including conditional ones) and CDATA.
  let cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  // Drop <script> / <style> / <iframe> / <object> / <embed> / <noscript>
  // blocks with their contents. These are always unsafe in email regardless
  // of what attributes they carry.
  cleaned = cleaned.replace(
    /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  // Also drop any orphan self-closing forms of those tags plus other
  // always-dangerous singletons.
  cleaned = cleaned.replace(
    /<(script|style|iframe|object|embed|noscript|template|svg|math|link|meta|base|form|input|button|textarea|select|option)\b[^>]*\/?>/gi,
    "",
  );

  // Walk every remaining tag, keep only allowlisted ones.
  const out: string[] = [];
  let i = 0;
  const len = cleaned.length;
  while (i < len) {
    const lt = cleaned.indexOf("<", i);
    if (lt === -1) {
      out.push(cleaned.slice(i));
      break;
    }
    // Emit text up to the '<'
    if (lt > i) out.push(cleaned.slice(i, lt));

    const gt = cleaned.indexOf(">", lt);
    if (gt === -1) {
      // Unterminated tag — drop the rest.
      break;
    }
    const inner = cleaned.slice(lt + 1, gt);
    i = gt + 1;

    const isClose = inner.startsWith("/");
    const body = isClose ? inner.slice(1) : inner;
    const nameMatch = body.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    if (!nameMatch) continue;
    const tagName = nameMatch[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) continue;

    if (isClose) {
      out.push(`</${tagName}>`);
      continue;
    }

    const attrs = sanitiseAttrs(body.slice(nameMatch[0].length));
    if (VOID_TAGS.has(tagName)) {
      out.push(`<${tagName}${attrs} />`);
    } else {
      out.push(`<${tagName}${attrs}>`);
    }
  }

  return out.join("");
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
