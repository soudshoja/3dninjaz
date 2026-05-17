"use client";

import { useState, useTransition, useRef } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { saveDraftLinkTemplate } from "@/actions/admin-store-settings-bank";

const DEFAULT_DRAFT_TEMPLATE =
  "Hi {{customer_name}}, here's your order from 3D Ninjaz: {{link}}. Reply here if you have questions.";

const TOKEN_CHIPS = [
  "{{customer_name}}",
  "{{order_number}}",
  "{{total}}",
  "{{link}}",
] as const;

const SAMPLE_DATA: Record<string, string> = {
  customer_name: "Sarah",
  order_number: "PN-12345678",
  total: "MYR 120.00",
  link: "https://app.3dninjaz.com/payment-links/abc123...",
};

/**
 * Lightweight Mustache-style renderer for client-side live preview.
 * Replaces {{key}} tokens with the values from the data map.
 * No server call required — purely synchronous string substitution.
 */
function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? `{{${key}}}`);
}

interface DraftTemplateFieldsetProps {
  initialTemplate: string | null;
}

/**
 * Phase 20 (20-12) — admin editable draft order message template fieldset.
 *
 * Mounted below BankDetailsFieldset on /admin/settings.
 * Token chips row inserts at textarea caret. Live preview renders below
 * textarea using client-side renderTemplate with sample data.
 *
 * UI-SPEC Surface 5: 32px chips, 120px textarea font-mono 14px,
 * brand-cream preview card, 40px reset + save buttons.
 */
export function DraftTemplateFieldset({ initialTemplate }: DraftTemplateFieldsetProps) {
  const [template, setTemplate] = useState(
    initialTemplate ?? DEFAULT_DRAFT_TEMPLATE,
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(token: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setTemplate((prev) => prev + token);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = template.substring(0, start);
    const after = template.substring(end);
    const next = before + token + after;
    setTemplate(next);
    // Restore focus + caret after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + token.length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  function resetToDefault() {
    setTemplate(DEFAULT_DRAFT_TEMPLATE);
    setSaved(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveDraftLinkTemplate({
        draftLinkTemplate: template || null,
      });
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  const previewText = renderTemplate(template, SAMPLE_DATA);

  return (
    <section
      className="rounded-[4px] border-2 p-5 space-y-5"
      style={{ borderColor: `${BRAND.ink}22`, backgroundColor: "#FAFAFA" }}
      aria-labelledby="sf-draft-template-heading"
    >
      <div>
        <h2
          id="sf-draft-template-heading"
          className="font-[var(--font-heading)] text-lg"
          style={{ color: BRAND.ink }}
        >
          Draft order message template
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Used when sending a draft order via WhatsApp or email. Mustache-style
          placeholders supported.
        </p>
      </div>

      {/* Token chips row */}
      <div>
        <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">
          Click to insert at cursor
        </p>
        <div className="flex flex-wrap gap-2">
          {TOKEN_CHIPS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="inline-flex items-center min-h-[32px] px-3 rounded-[4px] border-2 text-xs font-mono font-semibold transition-colors duration-150 hover:bg-slate-100"
              style={{
                borderColor: `${BRAND.ink}33`,
                color: BRAND.ink,
                backgroundColor: "white",
              }}
              aria-label={`Insert ${token}`}
            >
              {token}
            </button>
          ))}
        </div>
      </div>

      {/* Textarea */}
      <div>
        <label
          htmlFor="dt-template"
          className="block text-sm font-semibold mb-1"
          style={{ color: BRAND.ink }}
        >
          Message template
        </label>
        <textarea
          id="dt-template"
          ref={textareaRef}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="w-full rounded-[4px] border-2 p-3 font-mono text-sm outline-none transition-colors duration-150 focus:border-[#0080ff] bg-white resize-y"
          style={{
            minHeight: "120px",
            borderColor: `${BRAND.ink}33`,
            color: BRAND.ink,
          }}
          placeholder={DEFAULT_DRAFT_TEMPLATE}
        />
      </div>

      {/* Live preview card */}
      <div>
        <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">
          Preview (sample data)
        </p>
        <div
          className="rounded-[4px] border-2 p-4 text-sm"
          style={{
            backgroundColor: BRAND.cream,
            borderColor: `${BRAND.ink}33`,
            color: BRAND.ink,
          }}
        >
          {previewText || (
            <span className="text-slate-400 italic">
              Start typing a template to see a preview here.
            </span>
          )}
        </div>
      </div>

      {/* Reset to default */}
      <button
        type="button"
        onClick={resetToDefault}
        className="min-h-[40px] rounded-[4px] border-2 px-4 py-1.5 text-sm font-semibold transition-colors duration-150 hover:bg-slate-50"
        style={{ borderColor: `${BRAND.ink}55`, color: BRAND.ink }}
      >
        Reset to default
      </button>

      {/* Feedback */}
      {error && (
        <p
          role="alert"
          className="rounded-[4px] px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      )}
      {saved && !error && (
        <p
          role="status"
          className="rounded-[4px] px-3 py-2 text-sm font-semibold flex items-center gap-2"
          style={{ backgroundColor: `#03C03C22`, color: BRAND.ink }}
        >
          <CheckCircle2
            size={16}
            className="shrink-0"
            style={{ color: "#03C03C" }}
          />
          Template saved.
        </p>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="min-h-[48px] rounded-[4px] px-6 py-2 font-bold text-white text-sm disabled:opacity-50 transition-colors duration-150 flex items-center gap-2"
        style={{ backgroundColor: BRAND.ink }}
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {pending ? "Saving…" : "Save template"}
      </button>
    </section>
  );
}
