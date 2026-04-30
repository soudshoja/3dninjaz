"use client";

/**
 * Quill rich-text editor (client-only).
 *
 * Word-style fixed toolbar — visible at the top of the editor, all formatting
 * buttons shown upfront. Customer-friendly UX as requested.
 *
 * Uses react-quill-new (React 19 / Next 15 compatible fork of react-quill).
 *
 * Output: HTML string via onChange (Quill's getSemanticHTML fallback to .root.innerHTML).
 *
 * Imported lazily via next/dynamic({ ssr: false }) from the wrapper so Quill
 * never touches the SSR boundary (it requires `document`).
 *
 * NB: Filename is preserved (novel-rich-text-editor.client.tsx) so the public
 * import path / git history continuity stays intact, even though the
 * implementation switched from Novel/Tiptap to Quill.
 */

import "react-quill-new/dist/quill.snow.css";
import dynamicImport from "next/dynamic";
import { useMemo, useRef } from "react";
import { Quill } from "react-quill-new";

// ---------------------------------------------------------------------------
// System font slugs — registered once at module load (idempotent guard).
// ---------------------------------------------------------------------------
const SYSTEM_FONT_SLUGS = [
  "serif",
  "monospace",
  "arial",
  "times",
  "georgia",
  "courier",
  "verdana",
  "tahoma",
  "comic",
];

let fontsRegistered = false;
function ensureFontsRegistered(extraSlugs: string[] = []) {
  if (fontsRegistered && extraSlugs.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Font = Quill.import("formats/font") as any;
  Font.whitelist = [...SYSTEM_FONT_SLUGS, ...extraSlugs];
  Quill.register(Font, true);
  if (extraSlugs.length === 0) fontsRegistered = true;
}

const ReactQuill = dynamicImport(() => import("react-quill-new"), {
  ssr: false,
  loading: () => (
    <div
      className="h-40 rounded-md border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground"
      aria-busy="true"
    >
      Loading editor…
    </div>
  ),
});

type Props = {
  value: string;
  onChange: (html: string) => void;
  /** Custom uploaded fonts to include in the font picker. */
  customFonts?: { familySlug: string; displayName: string }[];
};

export function NovelEditorInner({ value, onChange, customFonts = [] }: Props) {
  const customSlugs = customFonts.map((f) => f.familySlug);
  // Register on first render (and whenever customSlugs change)
  const prevSlugsRef = useRef<string>("");
  const slugKey = customSlugs.join(",");
  if (slugKey !== prevSlugsRef.current) {
    prevSlugsRef.current = slugKey;
    ensureFontsRegistered(customSlugs);
  }

  // Word-style ribbon — every option visible up front. Buckets:
  // - Block/style: header (H1-H3 + body), font family, size
  // - Inline: bold / italic / underline / strike
  // - Colour: foreground + background
  // - Alignment: left / center / right / justify
  // - Lists: ordered / bullet / indent
  // - Misc: link, blockquote, clean
  const modules = useMemo(
    () => ({
      toolbar: [
        [
          { header: [1, 2, 3, false] },
          {
            font: [
              "",
              "serif",
              "monospace",
              "arial",
              "times",
              "georgia",
              "courier",
              "verdana",
              "tahoma",
              "comic",
              ...customSlugs,
            ],
          },
          { size: [] },
        ],
        ["bold", "italic", "underline", "strike"],
        [{ color: [] }, { background: [] }],
        [{ align: [] }],
        [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
        ["blockquote", "link"],
        ["clean"],
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slugKey],
  );

  const formats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "align",
    "list",
    "indent",
    "blockquote",
    "link",
  ];

  return (
    <div className="quill-host rounded-md border border-[var(--color-brand-border)] bg-white">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder="Start typing… use the toolbar to format."
      />
      <style jsx>{`
        .quill-host :global(.ql-toolbar) {
          border-top: 0;
          border-left: 0;
          border-right: 0;
          background: #f8fafc;
          border-radius: 6px 6px 0 0;
          padding: 6px 8px;
        }
        .quill-host :global(.ql-container) {
          min-height: 220px;
          border: 0;
          font-size: 14px;
        }
        .quill-host :global(.ql-editor) {
          min-height: 220px;
          padding: 14px 16px;
        }
        .quill-host :global(.ql-editor.ql-blank::before) {
          color: #94a3b8;
          font-style: normal;
        }

        /* ── Font picker label (selected value shown in toolbar) ── */
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label::before) {
          content: "Sans Serif";
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="serif"]::before) {
          content: "Serif";
          font-family: Georgia, "Times New Roman", Times, serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="monospace"]::before) {
          content: "Monospace";
          font-family: ui-monospace, Menlo, Consolas, "Liberation Mono", monospace;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="arial"]::before) {
          content: "Arial";
          font-family: Arial, Helvetica, sans-serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="times"]::before) {
          content: "Times New Roman";
          font-family: "Times New Roman", Times, serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="georgia"]::before) {
          content: "Georgia";
          font-family: Georgia, "Times New Roman", serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="courier"]::before) {
          content: "Courier New";
          font-family: "Courier New", Courier, ui-monospace, monospace;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="verdana"]::before) {
          content: "Verdana";
          font-family: Verdana, Geneva, sans-serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="tahoma"]::before) {
          content: "Tahoma";
          font-family: Tahoma, "Lucida Sans Unicode", sans-serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="comic"]::before) {
          content: "Comic Sans";
          font-family: "Comic Sans MS", "Comic Sans", cursive;
        }

        /* ── Font picker dropdown items ── */
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item::before) {
          content: "Sans Serif";
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="serif"]::before) {
          content: "Serif";
          font-family: Georgia, "Times New Roman", Times, serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="monospace"]::before) {
          content: "Monospace";
          font-family: ui-monospace, Menlo, Consolas, "Liberation Mono", monospace;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="arial"]::before) {
          content: "Arial";
          font-family: Arial, Helvetica, sans-serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="times"]::before) {
          content: "Times New Roman";
          font-family: "Times New Roman", Times, serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="georgia"]::before) {
          content: "Georgia";
          font-family: Georgia, "Times New Roman", serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="courier"]::before) {
          content: "Courier New";
          font-family: "Courier New", Courier, ui-monospace, monospace;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="verdana"]::before) {
          content: "Verdana";
          font-family: Verdana, Geneva, sans-serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="tahoma"]::before) {
          content: "Tahoma";
          font-family: Tahoma, "Lucida Sans Unicode", sans-serif;
        }
        .quill-host :global(.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="comic"]::before) {
          content: "Comic Sans";
          font-family: "Comic Sans MS", "Comic Sans", cursive;
        }

        /* ── Editor output rendering (system fonts) ── */
        .quill-host :global(.ql-font-serif) {
          font-family: Georgia, "Times New Roman", Times, serif;
        }
        .quill-host :global(.ql-font-monospace) {
          font-family: ui-monospace, Menlo, Consolas, "Liberation Mono", monospace;
        }
        .quill-host :global(.ql-font-arial) {
          font-family: Arial, Helvetica, sans-serif;
        }
        .quill-host :global(.ql-font-times) {
          font-family: "Times New Roman", Times, serif;
        }
        .quill-host :global(.ql-font-georgia) {
          font-family: Georgia, "Times New Roman", serif;
        }
        .quill-host :global(.ql-font-courier) {
          font-family: "Courier New", Courier, ui-monospace, monospace;
        }
        .quill-host :global(.ql-font-verdana) {
          font-family: Verdana, Geneva, sans-serif;
        }
        .quill-host :global(.ql-font-tahoma) {
          font-family: Tahoma, "Lucida Sans Unicode", sans-serif;
        }
        .quill-host :global(.ql-font-comic) {
          font-family: "Comic Sans MS", "Comic Sans", cursive;
        }
      `}</style>
    </div>
  );
}
