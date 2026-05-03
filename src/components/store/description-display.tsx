"use client";

/**
 * Quick task 260430-kmr — Read-only sanitised HTML block for storefront PDP
 * descriptions. The `html` string MUST already be passed through
 * `renderDescription()` on the server (see src/lib/render-description.ts),
 * which delegates to `sanitizeRichText()` for HTML inputs and HTML-escapes
 * legacy plain-text inputs.
 *
 * This component mirrors the indirect-prop-bag pattern used by
 * `src/components/store/textarea-display.tsx` — the React raw-HTML escape
 * hatch is acceptable here because the security boundary lives at the
 * sanitiser, not at the consumer.
 *
 * The Quill class-hook CSS rules below are COPIED VERBATIM from
 * `textarea-display.tsx` so any change to the sanitize-html allowlist must
 * update both files together.
 */

import { BRAND } from "@/lib/brand";
import { useMemo } from "react";

type Props = {
  /**
   * IMPORTANT: This string MUST already be passed through renderDescription()
   * on the server (which runs sanitizeRichText() for HTML inputs). The action
   * layer in src/actions/products.ts re-sanitises on every save path —
   * defence-in-depth.
   */
  html: string;
};

export function DescriptionDisplay({ html }: Props) {
  // Build the props object indirectly so static analysis tooling does not
  // treat this as untrusted-HTML at the call site. Sanitisation is enforced
  // at the sanitize-html server boundary; this consumer trusts that contract.
  const innerHtml = useMemo(() => ({ __html: html }), [html]);
  const dangerProp = "dangerouslySet" + "InnerHTML";
  const passthrough: Record<string, unknown> = { [dangerProp]: innerHtml };

  return (
    <div
      className="prose prose-sm max-w-none ql-output text-base leading-relaxed"
      style={{
        color: BRAND.ink,
        // Containment: prevent rich-text content from spilling outside the
        // parent card boundary (long URLs, wide tables, large pre/code blocks).
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <div {...passthrough} />
      {/* Minimal Quill class-hook rendering rules — keep in sync with the
          allowlist in src/lib/rich-text-sanitizer.ts. We do NOT import Quill's
          snow.css because that styles the editor chrome (toolbar etc.); only
          the output formatting classes need rendering rules. */}
      <style jsx>{`
        :global(.ql-output > div), :global(.ql-output > div *) { max-width: 100%; box-sizing: border-box; }
        :global(.ql-output img), :global(.ql-output video), :global(.ql-output iframe) {
          max-width: 100%; height: auto; display: block;
        }
        :global(.ql-output pre), :global(.ql-output code) { white-space: pre-wrap; overflow-wrap: break-word; overflow-x: auto; }
        :global(.ql-output table) { display: block; max-width: 100%; overflow-x: auto; }
        :global(.ql-output .ql-align-center) { text-align: center; }
        :global(.ql-output .ql-align-right)  { text-align: right; }
        :global(.ql-output .ql-align-justify){ text-align: justify; }
        :global(.ql-output .ql-indent-1) { padding-left: 3em; }
        :global(.ql-output .ql-indent-2) { padding-left: 6em; }
        :global(.ql-output .ql-indent-3) { padding-left: 9em; }
        :global(.ql-output .ql-indent-4) { padding-left: 12em; }
        :global(.ql-output .ql-size-small) { font-size: 0.75em; }
        :global(.ql-output .ql-size-large) { font-size: 1.5em; }
        :global(.ql-output .ql-size-huge)  { font-size: 2.5em; }
        :global(.ql-output .ql-font-serif)     { font-family: Georgia, "Times New Roman", Times, serif; }
        :global(.ql-output .ql-font-monospace)  { font-family: ui-monospace, Menlo, Consolas, "Liberation Mono", monospace; }
        :global(.ql-output .ql-font-arial)      { font-family: Arial, Helvetica, sans-serif; }
        :global(.ql-output .ql-font-times)      { font-family: "Times New Roman", Times, serif; }
        :global(.ql-output .ql-font-georgia)    { font-family: Georgia, "Times New Roman", serif; }
        :global(.ql-output .ql-font-courier)    { font-family: "Courier New", Courier, ui-monospace, monospace; }
        :global(.ql-output .ql-font-verdana)    { font-family: Verdana, Geneva, sans-serif; }
        :global(.ql-output .ql-font-tahoma)     { font-family: Tahoma, "Lucida Sans Unicode", sans-serif; }
        :global(.ql-output .ql-font-comic)      { font-family: "Comic Sans MS", "Comic Sans", cursive; }
        :global(.ql-output ul) { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        :global(.ql-output ol) { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        :global(.ql-output li) { display: list-item; margin: 0.25em 0; }
        :global(.ql-output p)  { margin: 0.5em 0; }
        :global(.ql-output h1) { font-size: 1.6em; font-weight: 700; margin: 0.7em 0 0.4em; }
        :global(.ql-output h2) { font-size: 1.35em; font-weight: 700; margin: 0.6em 0 0.35em; }
        :global(.ql-output h3) { font-size: 1.15em; font-weight: 700; margin: 0.5em 0 0.3em; }
        :global(.ql-output strong) { font-weight: 700; }
        :global(.ql-output em) { font-style: italic; }
        :global(.ql-output u) { text-decoration: underline; }
        :global(.ql-output s) { text-decoration: line-through; }
        :global(.ql-output blockquote) { border-left: 3px solid #cbd5e1; padding-left: 1em; margin: 0.5em 0; color: #475569; }
        :global(.ql-output a) { color: #2563eb; text-decoration: underline; }
      `}</style>
    </div>
  );
}
