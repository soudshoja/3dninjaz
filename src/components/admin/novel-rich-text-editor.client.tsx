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
import { useMemo } from "react";

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
};

export function NovelEditorInner({ value, onChange }: Props) {
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
        [{ header: [1, 2, 3, false] }, { font: [] }, { size: [] }],
        ["bold", "italic", "underline", "strike"],
        [{ color: [] }, { background: [] }],
        [{ align: [] }],
        [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
        ["blockquote", "link"],
        ["clean"],
      ],
    }),
    [],
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
      `}</style>
    </div>
  );
}
