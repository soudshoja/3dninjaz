"use client";

/**
 * Quick task 260430-icx — Inner Novel/Tiptap editor (client-only).
 *
 * Built on Novel's EditorRoot + EditorContent + EditorBubble primitives,
 * which themselves wrap Tiptap. We use only the bubble menu (no slash
 * command, no AI). Bubble menu actions: bold, italic, underline,
 * strikethrough, h1, h2, h3, bulletList, orderedList.
 *
 * Output: emits HTML string via onChange (Tiptap's getHTML()).
 *
 * Imported lazily via next/dynamic({ ssr: false }) from the wrapper so
 * Tiptap never touches the SSR boundary (it requires `window`).
 */

import { useEffect, useState, useRef } from "react";
import {
  EditorRoot,
  EditorContent,
  EditorBubble,
  EditorBubbleItem,
  StarterKit,
  TiptapUnderline,
} from "novel";
import type { JSONContent, EditorInstance } from "novel";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
};

const BUBBLE_BTN =
  "flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100 transition-colors text-slate-700";

export function NovelEditorInner({ value, onChange }: Props) {
  // Tiptap accepts HTML directly as the `content` prop on the underlying editor.
  // We hold an initialContent in state so that `value` changes from the parent
  // (e.g. discarding edits) re-mount the editor cleanly.
  const [initialHtml] = useState(value);
  const editorRef = useRef<EditorInstance | null>(null);

  // Keep the editor in sync if the parent resets the value externally.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (ed.getHTML() !== value) {
      // Avoid infinite loop: only update when value diverges (e.g. external clear).
      ed.commands.setContent(value, false);
    }
  }, [value]);

  return (
    <EditorRoot>
      <EditorContent
        className="min-h-[160px] prose prose-sm max-w-none p-3 focus:outline-none"
        immediatelyRender={false}
        initialContent={undefined as unknown as JSONContent}
        // Pass HTML via the underlying Tiptap editor options:
        editorProps={{
          attributes: {
            class:
              "prose prose-sm max-w-none focus:outline-none min-h-[140px] [&_p]:my-1",
          },
        }}
        extensions={[StarterKit, TiptapUnderline]}
        onCreate={({ editor }) => {
          editorRef.current = editor;
          if (initialHtml) {
            editor.commands.setContent(initialHtml, false);
          }
        }}
        onUpdate={({ editor }) => {
          onChange(editor.getHTML());
        }}
      >
        <EditorBubble
          tippyOptions={{
            placement: "top",
          }}
          className="flex w-fit items-center gap-0.5 rounded-md border bg-white p-1 shadow-md"
        >
          <EditorBubbleItem
            onSelect={(editor) => editor.chain().focus().toggleBold().run()}
          >
            <button type="button" className={BUBBLE_BTN} aria-label="Bold">
              <Bold className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
          <EditorBubbleItem
            onSelect={(editor) => editor.chain().focus().toggleItalic().run()}
          >
            <button type="button" className={BUBBLE_BTN} aria-label="Italic">
              <Italic className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
          <EditorBubbleItem
            onSelect={(editor) => editor.chain().focus().toggleUnderline().run()}
          >
            <button
              type="button"
              className={BUBBLE_BTN}
              aria-label="Underline"
            >
              <UnderlineIcon className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
          <EditorBubbleItem
            onSelect={(editor) => editor.chain().focus().toggleStrike().run()}
          >
            <button
              type="button"
              className={BUBBLE_BTN}
              aria-label="Strikethrough"
            >
              <Strikethrough className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <EditorBubbleItem
            onSelect={(editor) =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <button type="button" className={BUBBLE_BTN} aria-label="Heading 1">
              <Heading1 className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
          <EditorBubbleItem
            onSelect={(editor) =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <button type="button" className={BUBBLE_BTN} aria-label="Heading 2">
              <Heading2 className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
          <EditorBubbleItem
            onSelect={(editor) =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            <button type="button" className={BUBBLE_BTN} aria-label="Heading 3">
              <Heading3 className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <EditorBubbleItem
            onSelect={(editor) =>
              editor.chain().focus().toggleBulletList().run()
            }
          >
            <button
              type="button"
              className={BUBBLE_BTN}
              aria-label="Bullet list"
            >
              <List className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
          <EditorBubbleItem
            onSelect={(editor) =>
              editor.chain().focus().toggleOrderedList().run()
            }
          >
            <button
              type="button"
              className={BUBBLE_BTN}
              aria-label="Ordered list"
            >
              <ListOrdered className="h-4 w-4" />
            </button>
          </EditorBubbleItem>
        </EditorBubble>
      </EditorContent>
    </EditorRoot>
  );
}
