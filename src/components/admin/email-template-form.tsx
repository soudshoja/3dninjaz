"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { updateEmailTemplate } from "@/actions/admin-email-templates";
import { EmailTemplatePreview } from "@/components/admin/email-template-preview";

type Props = {
  initial: {
    key: string;
    subject: string;
    html: string;
    variables: string[];
  };
};

/**
 * /admin/email-templates/[key]/edit form. Subject + HTML textarea + variable
 * sidebar + live preview iframe.
 *
 * - Click a variable chip to insert {{var_name}} at the cursor position.
 * - Preview updates 300ms after the last keystroke (debounced) so typing
 *   feels snappy; preview iframe is sandboxed (no JS).
 * - Save calls updateEmailTemplate which DOMPurify-sanitises before write.
 */
export function EmailTemplateForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [subject, setSubject] = useState(initial.subject);
  const [html, setHtml] = useState(initial.html);
  const [previewHtml, setPreviewHtml] = useState(initial.html);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Debounce preview by 300ms
  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(html), 300);
    return () => clearTimeout(t);
  }, [html]);

  const insertVariable = (name: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const placeholder = `{{${name}}}`;
    const next = html.slice(0, start) + placeholder + html.slice(end);
    setHtml(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + placeholder.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("key", initial.key);
    fd.set("subject", subject);
    fd.set("html", html);
    startTransition(async () => {
      const res = await updateEmailTemplate(fd);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-6 lg:grid-cols-[1fr_minmax(0,1fr)]"
      style={{ color: BRAND.ink }}
    >
      <section className="space-y-4">
        <div>
          <label
            htmlFor="et-subject"
            className="block text-sm font-semibold mb-1"
          >
            Subject
          </label>
          <input
            id="et-subject"
            type="text"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          />
        </div>

        <div>
          <label htmlFor="et-html" className="block text-sm font-semibold mb-1">
            HTML body
          </label>
          <textarea
            id="et-html"
            ref={textareaRef}
            rows={18}
            required
            minLength={10}
            maxLength={100_000}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            className="w-full rounded-xl border-2 px-3 py-3 text-xs font-mono leading-relaxed"
            style={{ borderColor: `${BRAND.ink}33` }}
          />
          <p className="mt-1 text-xs text-slate-500">
            HTML is sanitised on save (DOMPurify) and again at render time.
            Scripts and inline event handlers are stripped.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">Available variables</p>
          <div className="flex flex-wrap gap-2">
            {initial.variables.map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => insertVariable(v)}
                className="rounded-full border-2 px-3 py-1 text-xs font-mono min-h-[40px]"
                style={{
                  borderColor: `${BRAND.ink}33`,
                  color: BRAND.ink,
                }}
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
          >
            {error}
          </p>
        ) : null}
        {saved ? (
          <p
            role="status"
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ backgroundColor: `${BRAND.green}22`, color: BRAND.ink }}
          >
            Template saved.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.ink }}
        >
          {pending ? "Saving…" : "Save template"}
        </button>
      </section>

      <section>
        <p className="text-sm font-semibold mb-2">Live preview</p>
        <EmailTemplatePreview html={previewHtml} variables={initial.variables} />
      </section>
    </form>
  );
}
