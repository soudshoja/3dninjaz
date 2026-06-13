"use client";

/**
 * Notification Center editor — ui-ux-pro-max / Claymorphism treatment.
 *
 * Events are grouped into labelled sections. Each event card shows:
 *   - Enable/disable toggle
 *   - Event label + key badge
 *   - Expandable body: variable chips (click-to-insert) + template textarea + Save
 *
 * Groups:
 *   "Order Lifecycle"  — pending → approved → confirmation → processing → shipped → delivered → cancelled
 *   "Payment"          — refunded
 *   "Returns"          — requested → approved → rejected → received → expired
 */

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  CreditCard,
  RotateCcw,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  WHATSAPP_EVENT_KEYS,
  WHATSAPP_EVENT_LABELS,
  WHATSAPP_EVENT_VARIABLES,
} from "@/lib/whatsapp/events";
import type { WhatsappNotificationRow } from "@/lib/whatsapp/types";
import { updateWhatsappNotification } from "@/actions/admin-whatsapp-notifications";

// ============================================================================
// Groups
// ============================================================================

type EventGroup = {
  label: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  keys: (typeof WHATSAPP_EVENT_KEYS)[number][];
};

const EVENT_GROUPS: EventGroup[] = [
  {
    label: "Order Lifecycle",
    description: "Sent at each stage of an order, from payment to delivery.",
    icon: <ShoppingCart size={18} />,
    accentColor: BRAND.blue,
    keys: [
      "order_pending",
      "order_bank_transfer_instructions",
      "order_approved",
      "order_confirmation",
      "order_processing",
      "order_shipped",
      "order_delivered",
      "order_cancelled",
    ],
  },
  {
    label: "Payment",
    description: "Triggered when a refund is issued.",
    icon: <CreditCard size={18} />,
    accentColor: BRAND.purple,
    keys: ["order_refunded"],
  },
  {
    label: "Returns",
    description: "Sent at each step of the returns / replacement flow.",
    icon: <RotateCcw size={18} />,
    accentColor: BRAND.green,
    keys: [
      "return_requested",
      "return_approved",
      "return_rejected",
      "return_received",
      "return_expired",
    ],
  },
];

// ============================================================================
// State
// ============================================================================

interface CardState {
  enabled: boolean;
  template: string;
  saved: boolean;
  error: string | null;
  expanded: boolean;
}

interface Props {
  rows: WhatsappNotificationRow[];
}

// ============================================================================
// Component
// ============================================================================

// Any event key not placed in a group above. Without this, a newly added
// notification (e.g. order_bank_transfer_instructions, 2026-06-13) renders NO
// card at all — the admin can't toggle or edit it and it silently keeps
// sending. This fallback guarantees every seeded event is always reachable.
const GROUPED_KEYS = new Set(EVENT_GROUPS.flatMap((g) => g.keys));
const UNGROUPED_GROUP: EventGroup = {
  label: "Other",
  description: "Notifications not assigned to a group above.",
  icon: <ShoppingCart size={18} />,
  accentColor: BRAND.ink,
  keys: WHATSAPP_EVENT_KEYS.filter((k) => !GROUPED_KEYS.has(k)),
};
const ALL_GROUPS: EventGroup[] =
  UNGROUPED_GROUP.keys.length > 0
    ? [...EVENT_GROUPS, UNGROUPED_GROUP]
    : EVENT_GROUPS;

export function WhatsappNotificationsEditor({ rows }: Props) {
  const rowMap = Object.fromEntries(rows.map((r) => [r.eventKey, r]));

  const [cardStates, setCardStates] = useState<Record<string, CardState>>(() => {
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
        setTimeout(() => update(eventKey, { saved: false }), 3000);
      } else {
        update(eventKey, { error: res.error, saved: false });
      }
    });
  }

  return (
    <div className="space-y-8">
      {ALL_GROUPS.map((group) => (
        <section key={group.label}>
          {/* ── Group header ── */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl shadow-md flex-shrink-0"
              style={{ backgroundColor: group.accentColor, color: "#ffffff" }}
            >
              {group.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h2
                  className="font-extrabold text-lg leading-tight"
                  style={{ color: BRAND.ink }}
                >
                  {group.label}
                </h2>
                {/* Coloured accent bar */}
                <div
                  className="hidden sm:block h-0.5 flex-1 rounded-full opacity-30"
                  style={{ backgroundColor: group.accentColor }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>
            </div>
          </div>

          {/* ── Event cards ── */}
          <div className="space-y-3">
            {group.keys.map((eventKey) => {
              const card = cardStates[eventKey];
              if (!card) return null;
              const isPending = pendingKeys.has(eventKey);
              const vars = WHATSAPP_EVENT_VARIABLES[eventKey] ?? [];

              return (
                <div
                  key={eventKey}
                  className="rounded-3xl border-2 overflow-hidden shadow-[0_2px_12px_0_rgba(11,16,32,0.06)] transition-shadow duration-200 hover:shadow-[0_4px_20px_0_rgba(11,16,32,0.10)]"
                  style={{ borderColor: `${BRAND.ink}18`, backgroundColor: "#ffffff" }}
                >
                  {/* Card header — always visible */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left select-none"
                    style={{ backgroundColor: card.expanded ? `${group.accentColor}08` : "#fafafa" }}
                    onClick={() => update(eventKey, { expanded: !card.expanded })}
                    aria-expanded={card.expanded}
                    aria-controls={`wn-body-${eventKey}`}
                  >
                    {/* Toggle switch */}
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
                        className="w-10 h-5 rounded-full transition-colors duration-200"
                        style={{
                          backgroundColor: card.enabled
                            ? group.accentColor
                            : `${BRAND.ink}28`,
                        }}
                      />
                      <div
                        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                        style={{
                          transform: card.enabled ? "translateX(20px)" : "translateX(0)",
                        }}
                      />
                    </button>

                    {/* Label */}
                    <span
                      className="flex-1 text-sm font-semibold truncate"
                      style={{ color: BRAND.ink }}
                    >
                      {WHATSAPP_EVENT_LABELS[eventKey]}
                    </span>

                    {/* Event key pill */}
                    <span
                      className="hidden sm:inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-mono border flex-shrink-0"
                      style={{
                        borderColor: `${group.accentColor}44`,
                        color: group.accentColor,
                        backgroundColor: `${group.accentColor}0d`,
                      }}
                    >
                      {eventKey}
                    </span>

                    {/* Expand chevron */}
                    {card.expanded ? (
                      <ChevronUp
                        size={16}
                        className="flex-shrink-0"
                        style={{ color: group.accentColor }}
                      />
                    ) : (
                      <ChevronDown size={16} className="flex-shrink-0 text-slate-400" />
                    )}
                  </button>

                  {/* Expandable body */}
                  {card.expanded && (
                    <div
                      id={`wn-body-${eventKey}`}
                      className="px-4 pb-5 pt-3 space-y-4 border-t"
                      style={{ borderColor: `${BRAND.ink}0e` }}
                    >
                      {/* Event key pill (mobile — shown here instead of header) */}
                      <div className="sm:hidden">
                        <span
                          className="inline-flex items-center rounded-xl px-2.5 py-0.5 text-xs font-mono border"
                          style={{
                            borderColor: `${group.accentColor}44`,
                            color: group.accentColor,
                            backgroundColor: `${group.accentColor}0d`,
                          }}
                        >
                          {eventKey}
                        </span>
                      </div>

                      {/* Variable chips */}
                      {vars.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Available variables — click to insert
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {vars.map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => insertVar(eventKey, v)}
                                className="inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-mono border-2 transition-all duration-150 hover:opacity-80 active:scale-95"
                                style={{
                                  borderColor: `${group.accentColor}55`,
                                  color: group.accentColor,
                                  backgroundColor: `${group.accentColor}0d`,
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
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`wn-template-${eventKey}`}
                          className="block text-xs font-bold text-slate-600 uppercase tracking-widest"
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
                          className="w-full rounded-2xl border-2 px-3.5 py-3 text-sm font-mono bg-white outline-none transition-all duration-150 resize-y"
                          style={{
                            borderColor: `${BRAND.ink}22`,
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = group.accentColor;
                            e.currentTarget.style.boxShadow = `0 0 0 3px ${group.accentColor}18`;
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = `${BRAND.ink}22`;
                            e.currentTarget.style.boxShadow = "none";
                          }}
                          placeholder="Hi {{customerName}}, your order {{orderNumber}} …"
                        />
                        <p className="text-xs text-slate-400 text-right">
                          {card.template.length} / 2000
                        </p>
                      </div>

                      {/* Error */}
                      {card.error && (
                        <div
                          role="alert"
                          className="rounded-2xl px-4 py-3 text-sm border-2"
                          style={{
                            backgroundColor: "#fee2e2",
                            borderColor: "#fca5a5",
                            color: "#991b1b",
                          }}
                        >
                          {card.error}
                        </div>
                      )}

                      {/* Success */}
                      {card.saved && !card.error && (
                        <div
                          role="status"
                          className="rounded-2xl px-4 py-3 text-sm font-semibold flex items-center gap-2 border-2"
                          style={{
                            backgroundColor: `${BRAND.green}15`,
                            borderColor: `${BRAND.green}44`,
                            color: BRAND.ink,
                          }}
                        >
                          <CheckCircle2 size={16} style={{ color: BRAND.green }} />
                          Saved successfully.
                        </div>
                      )}

                      {/* Save button */}
                      <button
                        type="button"
                        onClick={() => handleSave(eventKey)}
                        disabled={isPending}
                        className="min-h-[44px] rounded-2xl px-6 py-2 font-bold text-white text-sm disabled:opacity-50 transition-all duration-150 flex items-center gap-2 active:scale-95 shadow-md"
                        style={{ backgroundColor: group.accentColor }}
                      >
                        {isPending && <Loader2 size={14} className="animate-spin" />}
                        {isPending ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
