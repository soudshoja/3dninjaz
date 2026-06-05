"use client";

/**
 * Notification Center editor.
 *
 * Renders one card per WhatsApp event key with:
 *   - Enable/disable toggle
 *   - Textarea for the message template
 *   - Variable hints (click-to-insert)
 *   - Per-card Save button backed by updateWhatsappNotification server action
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  WHATSAPP_EVENT_KEYS,
  WHATSAPP_EVENT_LABELS,
  WHATSAPP_EVENT_VARIABLES,
} from "@/lib/whatsapp/events";
import type { WhatsappNotificationRow } from "@/lib/whatsapp/types";
import { updateWhatsappNotification } from "@/actions/admin-whatsapp-notifications";

interface Props {
  rows: WhatsappNotificationRow[];
}

interface CardState {
  enabled: boolean;
  template: string;
  saved: boolean;
  error: string | null;
  expanded: boolean;
}

export function WhatsappNotificationsEditor({ rows }: Props) {
  // Build initial card state from rows, keyed by eventKey
  const rowMap = Object.fromEntries(rows.map((r) => [r.eventKey, r]));

  const [cardStates, setCardStates] = useState<
    Record<string, CardState>
  >(() => {
    const initial: Record<string, CardState> = {};
    for (const key of WHATSAPP_EVENT_KEYS) {
      const row = rowMap[key];
      if (!row) continue;
      initial[key] = {
        enabled: row.enabled,
        template: row.template,
        saved: false,
        error: null,
        expanded: false,
      };
    }
    return initial;
  });

  const [, startTransition] = useTransition();
  // Per-card pending state (useTransition is shared but we need per-card)
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  function update(key: string, patch: Partial<CardState>) {
    setCardStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  function insertVar(key: string, varName: string) {
    const current = cardStates[key]?.template ?? "";
    update(key, { template: current + `{{${varName}}}` });
  }

  function handleSave(eventKey: string) {
    const card = cardStates[eventKey];
    if (!card) return;
    update(eventKey, { saved: false, error: null });
    setPendingKeys((prev) => new Set(prev).add(eventKey));

    startTransition(async () => {
      const fd = new FormData();
      fd.set("eventKey", eventKey);
      fd.set("enabled", String(card.enabled));
      fd.set("template", card.template);

      const res = await updateWhatsappNotification(fd);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(eventKey);
        return next;
      });
      if (res.ok) {
        update(eventKey, { saved: true, error: null });
        // Clear "Saved." after 3s
        setTimeout(() => update(eventKey, { saved: false }), 3000);
      } else {
        update(eventKey, { error: res.error, saved: false });
      }
    });
  }

  return (
    <div className="space-y-4">
      {WHATSAPP_EVENT_KEYS.map((eventKey) => {
        const card = cardStates[eventKey];
        if (!card) return null;
        const isPending = pendingKeys.has(eventKey);
        const vars = WHATSAPP_EVENT_VARIABLES[eventKey] ?? [];

        return (
          <section
            key={eventKey}
            className="rounded-[4px] border-2 overflow-hidden"
            style={{ borderColor: `${BRAND.ink}22` }}
            aria-labelledby={`wn-heading-${eventKey}`}
          >
            {/* Card header — always visible */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
              style={{ backgroundColor: "#FAFAFA" }}
              onClick={() => update(eventKey, { expanded: !card.expanded })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  update(eventKey, { expanded: !card.expanded });
                }
              }}
              aria-expanded={card.expanded}
              aria-controls={`wn-body-${eventKey}`}
            >
              {/* Toggle switch (click without propagation) */}
              <button
                type="button"
                role="switch"
                aria-checked={card.enabled}
                aria-label={`Enable ${WHATSAPP_EVENT_LABELS[eventKey]}`}
                className="relative flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  update(eventKey, { enabled: !card.enabled, saved: false });
                }}
              >
                <div
                  className="w-9 h-5 rounded-full transition-colors duration-200"
                  style={{
                    backgroundColor: card.enabled
                      ? BRAND.green
                      : `${BRAND.ink}33`,
                  }}
                />
                <div
                  className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                  style={{
                    transform: card.enabled
                      ? "translateX(16px)"
                      : "translateX(0)",
                  }}
                />
              </button>

              <h3
                id={`wn-heading-${eventKey}`}
                className="flex-1 text-sm font-semibold"
                style={{ color: BRAND.ink }}
              >
                {WHATSAPP_EVENT_LABELS[eventKey]}
              </h3>

              <span className="text-xs text-slate-400 font-mono">
                {eventKey}
              </span>

              {card.expanded ? (
                <ChevronUp size={16} className="text-slate-400 shrink-0" />
              ) : (
                <ChevronDown size={16} className="text-slate-400 shrink-0" />
              )}
            </div>

            {/* Expandable body */}
            {card.expanded && (
              <div
                id={`wn-body-${eventKey}`}
                className="px-4 pb-4 pt-3 space-y-3 bg-white border-t"
                style={{ borderColor: `${BRAND.ink}11` }}
              >
                {/* Variable chips */}
                {vars.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Available variables (click to insert)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {vars.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => insertVar(eventKey, v)}
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-mono border transition-colors duration-150 hover:bg-slate-50"
                          style={{
                            borderColor: `${BRAND.blue}66`,
                            color: BRAND.blue,
                          }}
                          title={`Insert {{${v}}}`}
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Template textarea */}
                <div className="space-y-1">
                  <label
                    htmlFor={`wn-template-${eventKey}`}
                    className="block text-xs font-semibold text-slate-600"
                  >
                    Message template
                  </label>
                  <textarea
                    id={`wn-template-${eventKey}`}
                    rows={4}
                    value={card.template}
                    onChange={(e) =>
                      update(eventKey, { template: e.target.value, saved: false })
                    }
                    maxLength={2000}
                    className="w-full rounded-[4px] border-2 px-3 py-2 text-sm font-mono bg-white outline-none transition-colors duration-150 focus:border-[#0080ff] resize-y"
                    style={{ borderColor: `${BRAND.ink}33` }}
                    placeholder="Hi {{customerName}}, your order {{orderNumber}} …"
                  />
                  <p className="text-xs text-slate-400 text-right">
                    {card.template.length} / 2000
                  </p>
                </div>

                {/* Feedback */}
                {card.error && (
                  <p
                    role="alert"
                    className="rounded-[4px] px-3 py-2 text-sm"
                    style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
                  >
                    {card.error}
                  </p>
                )}
                {card.saved && !card.error && (
                  <p
                    role="status"
                    className="rounded-[4px] px-3 py-2 text-sm font-semibold flex items-center gap-2"
                    style={{
                      backgroundColor: `${BRAND.green}22`,
                      color: BRAND.ink,
                    }}
                  >
                    <CheckCircle2
                      size={14}
                      style={{ color: BRAND.green }}
                    />
                    Saved.
                  </p>
                )}

                {/* Save button */}
                <button
                  type="button"
                  onClick={() => handleSave(eventKey)}
                  disabled={isPending}
                  className="min-h-[40px] rounded-[4px] px-5 py-1.5 font-bold text-white text-sm disabled:opacity-50 transition-colors duration-150 flex items-center gap-2"
                  style={{ backgroundColor: BRAND.ink }}
                >
                  {isPending && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {isPending ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
