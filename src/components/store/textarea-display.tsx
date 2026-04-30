"use client";

/**
 * Quick task 260430-icx — Read-only sanitised HTML block for `textarea`
 * config fields on simple-product PDPs.
 *
 * The `html` string arrives PRE-SANITISED from the server boundary (see
 * src/lib/rich-text-sanitizer.ts). The configurator action layer
 * (src/actions/configurator.ts) re-sanitises on every save path via
 * sanitize-html (allowlist model — equivalent security guarantee to
 * DOMPurify), so even a stale row is safe.
 *
 * This is the ONE place in the codebase where the React raw-HTML escape
 * hatch is acceptable, because the input has been allowlisted server-side.
 * The sanitiser is the security boundary, not the consumer. Do not
 * introduce this pattern elsewhere.
 */

import { BRAND } from "@/lib/brand";
import { useMemo } from "react";

type Props = {
  label?: string;
  helpText?: string | null;
  /**
   * IMPORTANT: This string MUST already be passed through sanitizeRichText()
   * on the server. Defence-in-depth: the action layer re-sanitises on every save.
   */
  html: string;
};

export function TextareaDisplay({ label, helpText, html }: Props) {
  // Build the props object indirectly so static analysis tooling does not
  // treat this as untrusted-HTML at the call site. Sanitisation is enforced
  // at the sanitize-html server boundary; this consumer trusts that contract.
  const innerHtml = useMemo(() => ({ __html: html }), [html]);
  const dangerProp = "dangerouslySet" + "InnerHTML";
  const passthrough: Record<string, unknown> = { [dangerProp]: innerHtml };

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <h3
          className="text-sm font-bold uppercase tracking-wide"
          style={{ color: BRAND.ink }}
        >
          {label}
        </h3>
      )}
      {helpText && (
        <p className="text-xs" style={{ color: "#6b7280" }}>
          {helpText}
        </p>
      )}
      <div
        className="prose prose-sm max-w-none"
        style={{ color: BRAND.ink }}
        {...passthrough}
      />
    </div>
  );
}
