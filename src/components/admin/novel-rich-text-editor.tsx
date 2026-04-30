"use client";

/**
 * Quick task 260430-icx — Lazy-loaded Novel rich-text editor wrapper.
 *
 * SSR is disabled because Tiptap (which Novel wraps) touches `window` during
 * initialisation. The bubble menu provides bold / italic / underline /
 * strikethrough / lists / headings. AI features are NOT enabled (Novel's
 * AI completion is opt-in via separate components — we never mount them).
 *
 * Output: HTML string passed through onChange. The CALLER is responsible for
 * persisting the value via the configurator action layer, which re-sanitises
 * defensively via src/lib/rich-text-sanitizer.ts (sanitize-html allowlist).
 */

import dynamic from "next/dynamic";

type WrapperProps = {
  value: string;
  onChange: (html: string) => void;
};

// Lazy-load the inner editor so the heavy Tiptap bundle stays out of the
// initial admin route chunk. The editor module itself is also "use client".
const NovelEditorInner = dynamic(
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

export function NovelRichTextEditor({ value, onChange }: WrapperProps) {
  return (
    <div className="rounded-md border border-[var(--color-brand-border)] bg-white p-2">
      <NovelEditorInner value={value} onChange={onChange} />
    </div>
  );
}
