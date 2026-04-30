"use client";

/**
 * Quick task 260430-kmr — Inline fields editor for `simple` + `configurable`
 * productTypes on the unified `/admin/products/<id>/edit` page.
 *
 * Pattern:
 *   - Local state only — never calls a server action. Every change synthesises
 *     the next `PendingField[]` and bubbles up via `onFieldsChange`. The
 *     parent product-form's single Save button persists everything via the
 *     extended `updateProduct` server action (Task 4.5).
 *   - First row is the price row (D-1) — visualised here for layout symmetry,
 *     but persisted to `products.priceTiers` JSON via the existing simplePrice
 *     plumbing in product-form.tsx -> products.ts. For `configurable`, the
 *     price row is read-only and links to /configurator (tier-pricing builder).
 *   - One accordion expanded at a time (D-7) via `expandedId`.
 *   - Reorder via Up/Down buttons — no drag-and-drop.
 *   - Add field via dropdown popover — picks one of 5 field types and inserts
 *     a PendingField with sensible defaults (mirrors ConfigFieldFormBody).
 *
 * Sanitisation note: rich-text HTML for textarea fields is sanitised
 * SERVER-SIDE inside addConfigField/updateConfigField (existing behaviour).
 * The InlineFieldsEditor stores raw editor output locally; sanitisation
 * happens on the parent's Save click.
 */

import { useState } from "react";
import {
  Pencil,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Type,
  Hash,
  Palette,
  ListChecks,
  FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { BRAND } from "@/lib/brand";
import { NovelRichTextEditor } from "@/components/admin/novel-rich-text-editor";
import {
  TextConfigForm,
  NumberConfigForm,
  ColourConfigForm,
  SelectConfigForm,
} from "@/components/admin/config-field-modal";
import type { ConfigField } from "@/actions/configurator";
import type {
  FieldType,
  AnyFieldConfig,
  TextFieldConfig,
  NumberFieldConfig,
  ColourFieldConfig,
  SelectFieldConfig,
  TextareaFieldConfig,
} from "@/lib/config-fields";

// ============================================================================
// Types
// ============================================================================

/**
 * Local-state shape — extends ConfigField with a __pending flag so the parent
 * form's Save button knows what to add/update vs leave alone. New fields use
 * a `tmp-<uuid>` id so they're locally distinguishable from server-side rows.
 */
export type PendingField = ConfigField & {
  __pending: "new" | "modified" | "untouched";
};

type Props = {
  productId: string | null; // null in create flow
  productType: "simple" | "configurable";
  initialFields: PendingField[];
  initialPrice: string;
  onPriceChange: (price: string) => void;
  onFieldsChange: (fields: PendingField[]) => void;
};

// ============================================================================
// Display helpers (copied locally to avoid coupling to simple-fields-editor)
// ============================================================================

const TYPE_COLORS: Record<string, string> = {
  text: "#3B82F6",
  number: "#8B5CF6",
  colour: "#EC4899",
  select: "#F59E0B",
  textarea: "#10B981",
};

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  colour: "Colour",
  select: "Select",
  textarea: "Rich Text",
};

const TYPE_ICONS: Record<FieldType, typeof Type> = {
  text: Type,
  number: Hash,
  colour: Palette,
  select: ListChecks,
  textarea: FileText,
};

// ============================================================================
// Defaults — mirror ConfigFieldFormBody's useState initialisers so the inline
// path produces fields shaped identically to what the dialog path emits.
// ============================================================================

function defaultConfigFor(fieldType: FieldType): AnyFieldConfig {
  switch (fieldType) {
    case "text":
      return {
        maxLength: 8,
        allowedChars: "A-Z",
        uppercase: true,
        profanityCheck: false,
      } satisfies TextFieldConfig;
    case "number":
      return { min: 1, max: 10, step: 1 } satisfies NumberFieldConfig;
    case "colour":
      return { allowedColorIds: [] } satisfies ColourFieldConfig;
    case "select":
      return { options: [{ label: "", value: "" }] } satisfies SelectFieldConfig;
    case "textarea":
      return { html: "" } satisfies TextareaFieldConfig;
  }
}

function defaultLabelFor(fieldType: FieldType): string {
  return TYPE_LABELS[fieldType] ?? "Field";
}

// ============================================================================
// Component
// ============================================================================

export function InlineFieldsEditor({
  productId,
  productType,
  initialFields,
  initialPrice,
  onPriceChange,
  onFieldsChange,
}: Props) {
  const [fields, setFieldsLocal] = useState<PendingField[]>(initialFields);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState<string>(initialPrice);

  // Single source of truth for field mutations: update local + bubble up.
  function commitFields(next: PendingField[]) {
    setFieldsLocal(next);
    onFieldsChange(next);
  }

  function handlePriceChange(v: string) {
    setPriceInput(v);
    onPriceChange(v);
  }

  // ── Reorder ────────────────────────────────────────────────────────────────
  function moveField(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    commitFields(next);
  }

  // ── Patch a single field's metadata (label, helpText, required, config) ───
  function updateField(id: string, patch: Partial<PendingField>) {
    const next = fields.map((f) => {
      if (f.id !== id) return f;
      const merged: PendingField = {
        ...f,
        ...patch,
        __pending: f.__pending === "new" ? "new" : "modified",
      };
      return merged;
    });
    commitFields(next);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function deleteField(id: string) {
    const next = fields.filter((f) => f.id !== id);
    commitFields(next);
    if (expandedId === id) setExpandedId(null);
  }

  // ── Add field ─────────────────────────────────────────────────────────────
  function addField(fieldType: FieldType) {
    // Browser-safe random id; server replaces tmp- ids with real uuids on save.
    const tmpId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `tmp-${crypto.randomUUID()}`
        : `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = new Date();
    const newField: PendingField = {
      id: tmpId,
      productId: productId ?? "new",
      position: fields.length,
      fieldType,
      label: defaultLabelFor(fieldType),
      helpText: null,
      required: fieldType !== "textarea", // admin content blocks aren't customer-required
      locked: false,
      config: defaultConfigFor(fieldType),
      createdAt: now,
      updatedAt: now,
      __pending: "new",
    };
    commitFields([...fields, newField]);
    setExpandedId(newField.id);
  }

  // ── Toggle accordion ──────────────────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Used inside expanded body to patch the type-specific config sub-object.
  function patchConfig(field: PendingField, nextConfig: AnyFieldConfig) {
    updateField(field.id, { config: nextConfig });
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <section
      className="rounded-xl border bg-white"
      style={{ borderColor: "#E4E4E7" }}
    >
      {/* Card header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5 sm:py-4" style={{ borderColor: "#E4E4E7" }}>
        <div>
          <h3 className="font-heading text-lg font-bold" style={{ color: BRAND.ink }}>
            Fields &amp; Price
          </h3>
          <p className="text-xs text-muted-foreground">
            {productType === "simple"
              ? "Flat price plus optional customer-input fields and rich-text content blocks."
              : "Configurable products use tier pricing — manage that on the configurator. Field changes here save when you click Save below."}
          </p>
        </div>
        {/* Add field popover */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium min-h-[44px] hover:opacity-90 transition-opacity"
            style={{ backgroundColor: BRAND.green, color: "white" }}
          >
            <Plus className="h-4 w-4" />
            Add field
            <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {(["text", "number", "colour", "select", "textarea"] as FieldType[]).map((ft) => {
              const Icon = TYPE_ICONS[ft];
              return (
                <DropdownMenuItem
                  key={ft}
                  onClick={() => addField(ft)}
                  className="cursor-pointer"
                >
                  <Icon className="h-4 w-4" style={{ color: TYPE_COLORS[ft] }} />
                  <span className="font-medium">{TYPE_LABELS[ft]}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Price row (always first per D-1) */}
      <div
        className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: "#E4E4E7", backgroundColor: "#fafafa" }}
      >
        <Badge
          variant="secondary"
          className="font-bold uppercase text-[10px] tracking-wide shrink-0"
          style={{
            backgroundColor: `${BRAND.green}15`,
            color: BRAND.greenDark,
            borderColor: `${BRAND.green}40`,
          }}
        >
          Price
        </Badge>
        {productType === "simple" ? (
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <Label htmlFor="inlineSimplePrice" className="text-sm font-semibold whitespace-nowrap" style={{ color: BRAND.ink }}>
              Flat price (MYR)
            </Label>
            <Input
              id="inlineSimplePrice"
              type="text"
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => handlePriceChange(e.target.value)}
              placeholder="e.g. 19.99"
              className="h-9 max-w-[180px]"
            />
            <span className="text-xs text-muted-foreground">
              Customer fields below do not affect the price.
            </span>
          </div>
        ) : (
          // D-1: price visualised as first row, persisted on products.priceTiers JSON.
          // Configurable uses tier-pricing (multi-row) which we don't unify here per
          // user constraint "Locked fields stay on /configurator". For configurable
          // we render a read-only summary + link to the existing /configurator UI.
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <p className="text-sm flex-1 min-w-0" style={{ color: BRAND.ink }}>
              <span className="font-semibold">Tier-priced</span>
              <span className="text-muted-foreground"> · manage on the configurator</span>
            </p>
            {productId && (
              <a
                href={`/admin/products/${productId}/configurator`}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50 transition-colors"
                style={{ borderColor: BRAND.blue, color: BRAND.blue }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Configurator
              </a>
            )}
          </div>
        )}
      </div>

      {/* Empty state OR field rows */}
      {fields.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No fields yet. Click <strong>Add field</strong> to create your first one.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "#E4E4E7" }}>
          {fields.map((field, index) => {
            const colour = TYPE_COLORS[field.fieldType] ?? "#71717A";
            const expanded = expandedId === field.id;
            return (
              <li key={field.id} className="px-3 py-2 sm:px-4 sm:py-3">
                {/* Collapsed header row — same layout in both states */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {/* Reorder */}
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => moveField(index, "up")}
                      disabled={index === 0}
                      className="rounded p-0.5 disabled:opacity-30 hover:bg-slate-100"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(index, "down")}
                      disabled={index === fields.length - 1}
                      className="rounded p-0.5 disabled:opacity-30 hover:bg-slate-100"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Type badge */}
                  <Badge
                    variant="secondary"
                    className="font-bold uppercase text-[10px] tracking-wide"
                    style={{
                      backgroundColor: `${colour}15`,
                      color: colour,
                      borderColor: `${colour}40`,
                    }}
                  >
                    {TYPE_LABELS[field.fieldType] ?? field.fieldType}
                  </Badge>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-semibold text-sm truncate"
                      style={{ color: BRAND.ink }}
                    >
                      {field.label || <span className="italic text-muted-foreground">Untitled field</span>}
                    </p>
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground truncate">
                        {field.helpText}
                      </p>
                    )}
                  </div>

                  {/* Pending badge for newly added rows */}
                  {field.__pending === "new" && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase tracking-wide"
                      style={{ backgroundColor: "#FEF3C7", color: "#92400E", borderColor: "#FCD34D" }}
                    >
                      New
                    </Badge>
                  )}

                  {/* Edit toggle + Delete */}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(field.id)}
                      className="rounded-lg p-2 hover:bg-slate-100"
                      aria-label={expanded ? "Collapse" : "Expand to edit"}
                      aria-expanded={expanded}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteField(field.id)}
                      className="rounded-lg p-2 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete field"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded body */}
                {expanded && (
                  <ExpandedFieldBody
                    field={field}
                    productId={productId ?? "new"}
                    onLabelChange={(v) => updateField(field.id, { label: v })}
                    onHelpTextChange={(v) =>
                      updateField(field.id, { helpText: v === "" ? null : v })
                    }
                    onRequiredChange={(v) => updateField(field.id, { required: v })}
                    onConfigChange={(c) => patchConfig(field, c)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer hint */}
      <footer className="flex items-start gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:px-5" style={{ borderColor: "#E4E4E7" }}>
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
        <span>
          Changes here are not persisted until you click <strong>Save</strong> at the bottom of the page.
        </span>
      </footer>
    </section>
  );
}

// ============================================================================
// Expanded body — Basics + per-type config form
// ============================================================================

function ExpandedFieldBody({
  field,
  productId,
  onLabelChange,
  onHelpTextChange,
  onRequiredChange,
  onConfigChange,
}: {
  field: PendingField;
  productId: string;
  onLabelChange: (v: string) => void;
  onHelpTextChange: (v: string) => void;
  onRequiredChange: (v: boolean) => void;
  onConfigChange: (c: AnyFieldConfig) => void;
}) {
  return (
    <div className="mt-3 space-y-4 rounded-lg border bg-slate-50/40 p-4" style={{ borderColor: "#E4E4E7" }}>
      {/* Basics */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor={`label-${field.id}`}>Label *</Label>
          <Input
            id={`label-${field.id}`}
            value={field.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="e.g. Your name"
            className="h-9"
            maxLength={80}
            disabled={field.locked}
          />
          {field.locked && (
            <p className="text-xs text-muted-foreground">
              Locked label — fixed for this product type.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`help-${field.id}`}>Help text</Label>
          <Input
            id={`help-${field.id}`}
            value={field.helpText ?? ""}
            onChange={(e) => onHelpTextChange(e.target.value)}
            placeholder="Optional hint shown to customer"
            className="h-9"
            maxLength={200}
          />
        </div>

        {/* Required toggle — hidden for textarea (admin content, not a form field) */}
        {field.fieldType !== "textarea" && (
          <div className="flex items-center gap-3">
            <Switch
              id={`required-${field.id}`}
              checked={field.required}
              onCheckedChange={onRequiredChange}
            />
            <Label htmlFor={`required-${field.id}`} className="cursor-pointer">
              Required
            </Label>
          </div>
        )}
      </div>

      {/* Type-specific settings */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-slate-500">
          {TYPE_LABELS[field.fieldType] ?? "Settings"} settings
        </Label>
        {field.fieldType === "text" && (
          <TextConfigForm
            value={field.config as TextFieldConfig}
            onChange={(v) => onConfigChange(v as TextFieldConfig)}
          />
        )}
        {field.fieldType === "number" && (
          <NumberConfigForm
            value={field.config as NumberFieldConfig}
            onChange={(v) => onConfigChange(v as NumberFieldConfig)}
          />
        )}
        {field.fieldType === "colour" && (
          <ColourConfigForm
            productId={productId}
            value={field.config as ColourFieldConfig}
            onChange={(v) => onConfigChange(v as ColourFieldConfig)}
          />
        )}
        {field.fieldType === "select" && (
          <SelectConfigForm
            value={field.config as SelectFieldConfig}
            onChange={(v) => onConfigChange(v as SelectFieldConfig)}
          />
        )}
        {field.fieldType === "textarea" && (
          <NovelRichTextEditor
            value={(field.config as TextareaFieldConfig).html ?? ""}
            onChange={(html) => onConfigChange({ html } satisfies TextareaFieldConfig)}
          />
        )}
      </div>
    </div>
  );
}
