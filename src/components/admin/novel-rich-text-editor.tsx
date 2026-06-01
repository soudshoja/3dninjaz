"use client";

/**
 * Lazy-loaded Quill rich-text editor wrapper.
 *
 * SSR is disabled because Quill touches `document` during initialisation.
 * Word-style fixed toolbar is built-in via the inner client component.
 *
 * Output: HTML string passed through onChange. The CALLER is responsible for
 * persisting the value via the configurator action layer, which re-sanitises
 * defensively via src/lib/rich-text-sanitizer.ts (sanitize-html allowlist).
 *
 * Component name kept as `NovelRichTextEditor` for import-path continuity
 * with the previous Novel-based implementation — the switch to Quill is
 * an implementation detail that does not change the public contract.
 */

import dynamic from "next/dynamic";

type WrapperProps = {
  value: string;
  onChange: (html: string) => void;
  /** Custom uploaded fonts to include in the font picker. */
  customFonts?: { familySlug: string; displayName: string }[];
};

const QuillEditorInner = dynamic(
  () => import("./novel-rich-text-editor.client").then((m) => m.NovelEditorInner),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-40 rounded-md border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground"
        aria-busy="true"
      >
        Loading editor…
      </div>
    ),
  },
);

export function NovelRichTextEditor({ value, onChange, customFonts }: WrapperProps) {
  return <QuillEditorInner value={value} onChange={onChange} customFonts={customFonts} />;
}
