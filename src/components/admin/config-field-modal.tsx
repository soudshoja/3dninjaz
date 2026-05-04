"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Plus, Trash2, Type, Hash, Palette, ListChecks, FileText, ImagePlus, Camera, X } from "lucide-react";
import { ColourPickerDialog, type ColourPickerRow, type MyColoursPrompt } from "@/components/admin/colour-picker-dialog";
import { getActiveColoursForPicker, getMyColoursForPicker } from "@/actions/admin-colours";
import {
  addConfigField,
  updateConfigField,
  uploadSelectOptionImage,
  removeSelectOptionImage,
  type ConfigField,
} from "@/actions/configurator";
import {
  TextFieldConfigSchema,
  NumberFieldConfigSchema,
  ColourFieldConfigSchema,
  SelectFieldConfigSchema,
  TextareaFieldConfigSchema,
  type FieldType,
  type AnyFieldConfig,
  type TextFieldConfig,
  type NumberFieldConfig,
  type ColourFieldConfig,
  type SelectFieldConfig,
  type TextareaFieldConfig,
} from "@/lib/config-fields";
// Quick task 260430-icx — Novel rich-text editor for `textarea` field config.
import { NovelRichTextEditor } from "@/components/admin/novel-rich-text-editor";
import { BRAND } from "@/lib/brand";

// ============================================================================
// Phase 19-04 — config-field-modal
// Add/Edit dialog for a single configurator field.
// Switches inner form by fieldType.
// ============================================================================

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  mode: "add" | "edit";
  initialField?: ConfigField;
  /**
   * Pattern B refetch — called after successful save to refresh builder.
   * In edit mode, receives the updated ConfigField so the builder can
   * run auto-fill logic (e.g. Base → Clicker/Letter palette sync).
   */
  onSaved: (savedField?: ConfigField) => Promise<void> | void;
};

type FieldTypeMeta = {
  value: FieldType;
  label: string;
  description: string;
  Icon: typeof Type;
};

const FIELD_TYPES: FieldTypeMeta[] = [
  { value: "text",     label: "Text",      description: "Short typed input",       Icon: Type },
  { value: "number",   label: "Number",    description: "Numeric value",           Icon: Hash },
  { value: "colour",   label: "Colour",    description: "Pick from palette",       Icon: Palette },
  { value: "select",   label: "Select",    description: "Choose from a list",      Icon: ListChecks },
  // Quick task 260430-icx — admin-authored content block (read-only on PDP).
  { value: "textarea", label: "Rich Text", description: "Admin description block", Icon: FileText },
];

// ---------------------------------------------------------------------------
// Type-specific config forms
// ---------------------------------------------------------------------------

export function TextConfigForm({
  value,
  onChange,
}: {
  value: Partial<TextFieldConfig>;
  onChange: (v: Partial<TextFieldConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="maxLength">Max length</Label>
        <Input
          id="maxLength"
          type="number"
          min={1}
          max={200}
          value={value.maxLength ?? 8}
          onChange={(e) => onChange({ ...value, maxLength: Number(e.target.value) })}
          className="h-9 w-28"
        />
        <p className="text-xs text-muted-foreground">1–200 characters</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="allowedChars">Allowed characters (regex char class)</Label>
        <Input
          id="allowedChars"
          value={value.allowedChars ?? "A-Z"}
          onChange={(e) => onChange({ ...value, allowedChars: e.target.value })}
          placeholder="e.g. A-Z or A-Za-z0-9"
          className="h-9"
        />
        <p className="text-xs text-muted-foreground">Used to validate customer input</p>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="uppercase"
          checked={value.uppercase ?? true}
          onCheckedChange={(v) => onChange({ ...value, uppercase: v })}
        />
        <Label htmlFor="uppercase" className="cursor-pointer">Force uppercase</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="profanityCheck"
          checked={value.profanityCheck ?? false}
          onCheckedChange={(v) => onChange({ ...value, profanityCheck: v })}
        />
        <Label htmlFor="profanityCheck" className="cursor-pointer">Profanity check</Label>
      </div>
      <p className="text-xs text-muted-foreground bg-slate-50 rounded px-3 py-2">
        Preview: customer types up to {value.maxLength ?? 8} character(s), {value.uppercase ? "uppercase" : "any case"}
      </p>
    </div>
  );
}

export function NumberConfigForm({
  value,
  onChange,
}: {
  value: Partial<NumberFieldConfig>;
  onChange: (v: Partial<NumberFieldConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="numMin">Min</Label>
          <Input
            id="numMin"
            type="number"
            value={value.min ?? 1}
            onChange={(e) => onChange({ ...value, min: Number(e.target.value) })}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="numMax">Max</Label>
          <Input
            id="numMax"
            type="number"
            value={value.max ?? 10}
            onChange={(e) => onChange({ ...value, max: Number(e.target.value) })}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="numStep">Step</Label>
          <Input
            id="numStep"
            type="number"
            min={0.01}
            step={0.01}
            value={value.step ?? 1}
            onChange={(e) => onChange({ ...value, step: Number(e.target.value) })}
            className="h-9"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Range: {value.min ?? 1} to {value.max ?? 10}, step {value.step ?? 1}
      </p>
    </div>
  );
}

export function ColourConfigForm({
  productId,
  value,
  onChange,
}: {
  productId: string;
  value: Partial<ColourFieldConfig>;
  onChange: (v: Partial<ColourFieldConfig>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [knownRows, setKnownRows] = useState<ColourPickerRow[]>([]);
  const [myColoursPrompt, setMyColoursPrompt] = useState<MyColoursPrompt | null>(null);
  const [hasMyColours, setHasMyColours] = useState(false);
  const ids = value.allowedColorIds ?? [];

  // Fetch My Colours on mount to check if prompt should be shown
  useEffect(() => {
    let cancelled = false;
    getMyColoursForPicker()
      .then((rows) => {
        if (!cancelled && rows.length > 0) {
          setHasMyColours(true);
          setMyColoursPrompt({
            myColours: rows,
            onSkip: () => {
              setMyColoursPrompt(null);
            },
          });
        }
      })
      .catch(() => {
        // Fail soft — no My Colours available
        if (!cancelled) setHasMyColours(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build a lookup map from whatever rows we received from the picker.
  const rowById = new Map(knownRows.map((r) => [r.id, r]));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50 transition-colors min-h-[36px]"
          style={{ borderColor: BRAND.green, color: BRAND.green }}
        >
          Choose colours…
        </button>
        <span className="text-xs text-muted-foreground">
          {ids.length === 0 ? "No colours selected" : `${ids.length} colour${ids.length === 1 ? "" : "s"} selected`}
        </span>
      </div>

      {ids.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => {
            const row = rowById.get(id);
            if (!row) return null;
            return (
              <span
                key={id}
                title={row.name}
                aria-label={row.name}
                className="inline-block rounded-full shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: row.hex,
                  border: "1px solid rgba(0,0,0,0.12)",
                  boxShadow: "inset 0 0 0 2px #fff",
                }}
              />
            );
          })}
        </div>
      )}

      {/* ColourPickerDialog in select-multiple mode (D-08) */}
      <ColourPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode="select-multiple"
        productId={productId}
        optionId=""
        alreadyAttachedColourIds={new Set()}
        preSelectedColourIds={ids}
        onSelectMultiple={(selectedIds, selectedRows) => {
          setKnownRows(selectedRows);
          onChange({ ...value, allowedColorIds: selectedIds });
          setPickerOpen(false);
        }}
        onConfirmed={() => {}}
        myColoursPrompt={myColoursPrompt || undefined}
      />
    </div>
  );
}

type SelectOption = {
  label: string;
  value: string;
  priceAdd?: number;
  price?: number;
  sku?: string;
  imageUrl?: string;
};

// Internal per-option image uploader (needs fieldId from the saved field).
// When fieldId is undefined (new field not yet saved), shows a visually distinct
// disabled drop-zone with a "Save field first" tooltip so the gate is unmissable.
function SelectOptionImageCell({
  opt,
  fieldId,
  onImageUrl,
  onSaveFieldFirst,
}: {
  opt: SelectOption;
  fieldId: string | undefined;
  onImageUrl: (url: string | undefined) => void;
  /** Called when the user clicks "Save field" inside the disabled state. */
  onSaveFieldFirst?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("input");
    el.type = "file";
    el.accept = "image/*";
    return el;
  })[0];

  // wire the hidden input's change event once
  useEffect(() => {
    if (!inputRef) return;
    const handler = async () => {
      const file = inputRef.files?.[0];
      if (!file || !fieldId) return;
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadSelectOptionImage(fieldId, opt.value, fd);
      setUploading(false);
      if (result.ok) {
        onImageUrl(result.imageUrl);
      }
      // reset so same file can be re-selected
      inputRef.value = "";
    };
    inputRef.addEventListener("change", handler);
    return () => inputRef.removeEventListener("change", handler);
  }, [inputRef, fieldId, opt.value, onImageUrl]);

  const triggerPicker = () => {
    if (!fieldId || uploading) return;
    inputRef?.click();
  };

  const handleRemove = async () => {
    if (!fieldId) return;
    const result = await removeSelectOptionImage(fieldId, opt.value);
    if (result.ok) onImageUrl(undefined);
  };

  // ── Unsaved field: visually gated drop-zone ──────────────────────────────
  if (!fieldId) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 transition-colors duration-150"
          style={{ width: 56, height: 56, background: "#F7FAF4", opacity: 0.7 }}
          title="Save the field first to enable image upload"
        >
          <Camera className="h-4 w-4 text-zinc-400" aria-hidden />
          <span className="text-[9px] text-zinc-400 mt-0.5 leading-none">Upload</span>
        </div>
        {onSaveFieldFirst && (
          <button
            type="button"
            onClick={onSaveFieldFirst}
            className="text-[10px] font-medium underline underline-offset-2 transition-colors duration-150 cursor-pointer"
            style={{ color: BRAND.blue }}
            title="Save the field to enable image upload"
          >
            Save field
          </button>
        )}
        {!onSaveFieldFirst && (
          <span className="text-[9px] text-zinc-400 leading-none text-center">
            Save first
          </span>
        )}
      </div>
    );
  }

  // ── Has image: thumbnail + remove ────────────────────────────────────────
  if (opt.imageUrl) {
    return (
      <div className="relative flex flex-col items-center gap-0.5">
        <div className="relative rounded-lg overflow-hidden border border-zinc-200" style={{ width: 56, height: 56 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              opt.imageUrl.endsWith("/")
                ? opt.imageUrl + "400w.jpg"
                : opt.imageUrl.includes("/uploads/")
                  ? opt.imageUrl + "/400w.jpg"
                  : opt.imageUrl
            }
            alt={opt.label}
            className="h-full w-full object-cover cursor-pointer hover:opacity-80 transition-opacity duration-150"
            onClick={triggerPicker}
            title="Click to replace image"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full bg-white/90 hover:bg-red-50 border border-zinc-200 transition-colors duration-150"
            style={{ width: 18, height: 18 }}
            aria-label="Remove image"
          >
            <X className="h-2.5 w-2.5 text-red-500" />
          </button>
        </div>
        <span className="text-[9px] text-zinc-400 leading-none">Replace</span>
      </div>
    );
  }

  // ── Empty: clickable drop-zone ────────────────────────────────────────────
  return (
    <button
      type="button"
      onClick={triggerPicker}
      disabled={uploading}
      className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors duration-150 disabled:opacity-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40"
      style={{ width: 56, height: 56, borderColor: BRAND.blue + "66" }}
      aria-label="Upload image"
      title="Upload option image"
    >
      {uploading ? (
        <span className="text-[10px] text-zinc-400">…</span>
      ) : (
        <>
          <Camera className="h-4 w-4 mb-0.5" style={{ color: BRAND.blue }} aria-hidden />
          <span className="text-[9px] font-medium leading-none" style={{ color: BRAND.blue }}>
            Upload
          </span>
        </>
      )}
    </button>
  );
}

export function SelectConfigForm({
  value,
  onChange,
  fieldId,
  onSaveFieldFirst,
}: {
  value: Partial<SelectFieldConfig>;
  onChange: (v: Partial<SelectFieldConfig>) => void;
  /** fieldId is only available in edit mode (field already saved). Used for image upload. */
  fieldId?: string;
  /** Passed down so the image cell can surface a "Save field" CTA when fieldId is missing. */
  onSaveFieldFirst?: () => void;
}) {
  const options: SelectOption[] = value.options ?? [];

  const updateOption = (index: number, patch: Partial<SelectOption>) => {
    const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    onChange({ ...value, options: next });
  };

  const addOption = () => {
    onChange({ ...value, options: [...options, { label: "", value: "" }] });
  };

  const removeOption = (index: number) => {
    onChange({ ...value, options: options.filter((_, i) => i !== index) });
  };

  // Shared label style
  const lbl = "block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1";

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200 bg-white p-3 transition-colors duration-150"
          >
            {/* ── Row: sm+ 6-col grid; mobile stacked ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">

              {/* Label + Value — span 2 cols on sm */}
              <div className="flex gap-2 flex-1 min-w-0 sm:basis-0 sm:grow-[2]">
                <div className="flex-1 min-w-0">
                  <label className={lbl} htmlFor={`opt-label-${i}`}>Label</label>
                  <Input
                    id={`opt-label-${i}`}
                    placeholder="Display name"
                    value={opt.label}
                    onChange={(e) =>
                      updateOption(i, {
                        label: e.target.value,
                        value: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                      })
                    }
                    className="h-10 rounded-lg border-zinc-200 focus:ring-2 transition-colors duration-150"
                    style={{ ["--tw-ring-color" as string]: BRAND.blue + "55" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label className={lbl} htmlFor={`opt-value-${i}`}>Value</label>
                  <Input
                    id={`opt-value-${i}`}
                    placeholder="slug-key"
                    value={opt.value}
                    onChange={(e) => updateOption(i, { value: e.target.value })}
                    className="h-10 rounded-lg border-zinc-200 font-mono text-xs focus:ring-2 transition-colors duration-150"
                    style={{ ["--tw-ring-color" as string]: BRAND.blue + "55" }}
                  />
                </div>
              </div>

              {/* Price / +Add / SKU — 2-col on mobile, 3 equal cols on sm */}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:basis-0 sm:grow-[3]">
                <div className="min-w-0">
                  <label className={lbl} htmlFor={`opt-price-${i}`}>Price (RM)</label>
                  <Input
                    id={`opt-price-${i}`}
                    placeholder="—"
                    type="number"
                    min={0}
                    step={0.01}
                    value={opt.price ?? ""}
                    onChange={(e) =>
                      updateOption(i, {
                        price: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    className="h-10 rounded-lg border-zinc-200 focus:ring-2 transition-colors duration-150"
                    style={{ ["--tw-ring-color" as string]: BRAND.blue + "55" }}
                    title="Override price — replaces the tier price when this option is selected"
                  />
                </div>
                <div className="min-w-0">
                  <label className={lbl} htmlFor={`opt-priceadd-${i}`}>+Add (RM)</label>
                  <Input
                    id={`opt-priceadd-${i}`}
                    placeholder="—"
                    type="number"
                    min={0}
                    step={0.01}
                    value={opt.priceAdd ?? ""}
                    onChange={(e) =>
                      updateOption(i, {
                        priceAdd: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    className="h-10 rounded-lg border-zinc-200 focus:ring-2 transition-colors duration-150"
                    style={{ ["--tw-ring-color" as string]: BRAND.blue + "55" }}
                    title="Additive price shown in the dropdown label (+RM X)"
                  />
                </div>
                <div className="min-w-0 col-span-2 sm:col-span-1">
                  <label className={lbl} htmlFor={`opt-sku-${i}`}>SKU</label>
                  <Input
                    id={`opt-sku-${i}`}
                    placeholder="SKU-001"
                    value={opt.sku ?? ""}
                    onChange={(e) =>
                      updateOption(i, { sku: e.target.value || undefined })
                    }
                    className="h-10 rounded-lg border-zinc-200 font-mono text-xs focus:ring-2 transition-colors duration-150"
                    style={{ ["--tw-ring-color" as string]: BRAND.blue + "55" }}
                    title="SKU for this option value (for order fulfilment)"
                  />
                </div>
              </div>

              {/* Image + Delete — side by side, right-aligned */}
              <div className="flex items-end gap-2 shrink-0">
                <div>
                  <span className={lbl}>Image</span>
                  <SelectOptionImageCell
                    opt={opt}
                    fieldId={fieldId}
                    onImageUrl={(url) => updateOption(i, { imageUrl: url })}
                    onSaveFieldFirst={onSaveFieldFirst}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="flex items-center justify-center rounded-lg border border-zinc-200 text-red-400 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors duration-150 disabled:opacity-30"
                  style={{ width: 40, height: 40 }}
                  aria-label="Remove option"
                  disabled={options.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addOption}
        className="flex items-center gap-1.5 text-sm font-medium rounded-lg border px-3 py-2 hover:bg-slate-50 transition-colors duration-150 min-h-[40px]"
        style={{ borderColor: BRAND.green, color: BRAND.green }}
      >
        <Plus className="h-4 w-4" />
        Add option
      </button>

      {options.length === 0 && (
        <p className="text-xs text-red-500">At least one option is required</p>
      )}

      <p className="text-xs text-zinc-400">
        <strong>Price (RM)</strong> overrides the product tier price for this option.{" "}
        <strong>+Add</strong> is cosmetic only (shown in the dropdown label).{" "}
        {!fieldId && (
          <span className="text-amber-600 font-medium">
            Save this field once to unlock image upload per option.
          </span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form body — used by both the modal (non-locked) and the inline
// drawer (locked fields). Renders without any Dialog wrapper.
// ---------------------------------------------------------------------------

export type ConfigFieldFormBodyProps = {
  productId: string;
  mode: "add" | "edit";
  initialField?: ConfigField;
  onSaved: (savedField?: ConfigField) => Promise<void> | void;
  onCancel: () => void;
};

export function ConfigFieldFormBody({
  productId,
  mode,
  initialField,
  onSaved,
  onCancel,
}: ConfigFieldFormBodyProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fieldType, setFieldType] = useState<FieldType | null>(
    mode === "edit" ? (initialField?.fieldType ?? null) : null,
  );

  const [label, setLabel] = useState(initialField?.label ?? "");
  const [helpText, setHelpText] = useState(initialField?.helpText ?? "");
  const [required, setRequired] = useState(initialField?.required ?? true);

  const [textConfig, setTextConfig] = useState<Partial<TextFieldConfig>>(
    initialField?.fieldType === "text"
      ? (initialField.config as TextFieldConfig)
      : { maxLength: 8, allowedChars: "A-Z", uppercase: true, profanityCheck: false },
  );
  const [numberConfig, setNumberConfig] = useState<Partial<NumberFieldConfig>>(
    initialField?.fieldType === "number"
      ? (initialField.config as NumberFieldConfig)
      : { min: 1, max: 10, step: 1 },
  );
  const [colourConfig, setColourConfig] = useState<Partial<ColourFieldConfig>>(
    initialField?.fieldType === "colour"
      ? (initialField.config as ColourFieldConfig)
      : { allowedColorIds: [] },
  );
  const [selectConfig, setSelectConfig] = useState<Partial<SelectFieldConfig>>(
    initialField?.fieldType === "select"
      ? (initialField.config as SelectFieldConfig)
      : { options: [{ label: "", value: "" }] },
  );
  // Quick task 260430-icx — textarea (rich text) state.
  const [textareaConfig, setTextareaConfig] = useState<Partial<TextareaFieldConfig>>(
    initialField?.fieldType === "textarea"
      ? (initialField.config as TextareaFieldConfig)
      : { html: "" },
  );

  const getConfig = (): AnyFieldConfig | null => {
    if (fieldType === "text") return textConfig as AnyFieldConfig;
    if (fieldType === "number") return numberConfig as AnyFieldConfig;
    if (fieldType === "colour") return colourConfig as AnyFieldConfig;
    if (fieldType === "select") return selectConfig as AnyFieldConfig;
    if (fieldType === "textarea") return textareaConfig as AnyFieldConfig;
    return null;
  };

  const validateConfig = (): string | null => {
    const config = getConfig();
    if (!config) return "Please select a field type";
    if (!label.trim()) return "Label is required";
    const schema =
      fieldType === "text" ? TextFieldConfigSchema
      : fieldType === "number" ? NumberFieldConfigSchema
      : fieldType === "colour" ? ColourFieldConfigSchema
      : fieldType === "select" ? SelectFieldConfigSchema
      : fieldType === "textarea" ? TextareaFieldConfigSchema
      : null;
    if (!schema) return "Unknown field type";
    const result = schema.safeParse(config);
    if (!result.success) {
      return result.error.issues[0]?.message ?? "Invalid configuration";
    }
    return null;
  };

  const handleSave = () => {
    setError(null);
    const validationError = validateConfig();
    if (validationError) {
      setError(validationError);
      return;
    }
    const config = getConfig()!;
    startTransition(async () => {
      let result: { ok: boolean; error?: string };
      if (mode === "add") {
        result = await addConfigField(productId, {
          fieldType: fieldType!,
          label: label.trim(),
          helpText: helpText.trim() || undefined,
          required,
          config,
        });
      } else {
        result = await updateConfigField(initialField!.id, {
          label: label.trim(),
          helpText: helpText.trim() || null,
          required,
          config,
        });
      }
      if (!result.ok) {
        setError("error" in result ? (result.error ?? "Save failed") : "Save failed");
        return;
      }
      let savedField: ConfigField | undefined;
      if (mode === "edit" && initialField) {
        savedField = {
          ...initialField,
          label: initialField.locked ? initialField.label : label.trim(),
          fieldType: fieldType!,
          helpText: helpText.trim() || null,
          required,
          config: config as ConfigField["config"],
        };
      }
      await onSaved(savedField);
    });
  };

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex gap-2 items-start rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Field type picker (add mode only) — icon cards, 2 cols mobile / 5 cols desktop */}
      {mode === "add" && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">
            1. Choose field type
          </Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {FIELD_TYPES.map((ft) => {
              const selected = fieldType === ft.value;
              return (
                <button
                  key={ft.value}
                  type="button"
                  onClick={() => setFieldType(ft.value)}
                  className="group relative flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-all min-h-[88px] hover:bg-slate-50"
                  style={{
                    border: selected ? `2px solid ${BRAND.green}` : "1px solid #E4E4E7",
                    background: selected ? `${BRAND.green}0D` : "white",
                    color: BRAND.ink,
                  }}
                  title={ft.description}
                >
                  <ft.Icon
                    className="h-5 w-5 shrink-0 transition-colors"
                    style={{ color: selected ? BRAND.green : "#71717A" }}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold leading-none">{ft.label}</span>
                  <span className="text-[11px] leading-tight text-slate-500">
                    {ft.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit mode: locked type badge */}
      {mode === "edit" && fieldType && (
        <div className="flex items-center gap-2 flex-wrap">
          <Label>Field type</Label>
          <Badge variant="secondary" className="capitalize">
            {fieldType}
          </Badge>
          <span className="text-xs text-muted-foreground">(cannot change)</span>
          {initialField?.locked && (
            <Badge
              variant="secondary"
              className="text-xs"
              style={{ backgroundColor: "#DBEAFE", color: "#1D4ED8" }}
            >
              Locked
            </Badge>
          )}
        </div>
      )}

      {/* Common fields — grouped under a "Basics" section card */}
      {fieldType && (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
            <Label className="text-xs uppercase tracking-wide text-slate-500">
              {mode === "add" ? "2. Basics" : "Basics"}
            </Label>
          <div className="space-y-1">
            <Label htmlFor="fieldLabel">Label *</Label>
            {mode === "edit" && initialField?.locked ? (
              <>
                <Input
                  id="fieldLabel"
                  value={label}
                  readOnly
                  disabled
                  className="h-9 bg-slate-50 text-slate-400 cursor-not-allowed"
                  title="Locked label — fixed for Keyboard Clicker products"
                />
                <p className="text-xs text-muted-foreground">
                  Locked label — fixed for Keyboard Clicker products
                </p>
              </>
            ) : (
              <Input
                id="fieldLabel"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Your name"
                className="h-9"
                maxLength={80}
              />
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="helpText">Help text</Label>
            <Input
              id="helpText"
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              placeholder="Optional hint shown to customer"
              className="h-9"
              maxLength={200}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="required"
              checked={required}
              onCheckedChange={setRequired}
            />
            <Label htmlFor="required" className="cursor-pointer">Required</Label>
          </div>
          </div>

          {/* Type-specific settings card */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <Label className="text-xs uppercase tracking-wide text-slate-500">
              {mode === "add" ? "3. " : ""}
              {fieldType === "text"
                ? "Text"
                : fieldType === "number"
                ? "Number"
                : fieldType === "colour"
                ? "Colour"
                : fieldType === "select"
                ? "Select"
                : "Rich Text"}{" "}
              settings
            </Label>

          {fieldType === "text" && (
            <TextConfigForm value={textConfig} onChange={setTextConfig} />
          )}
          {fieldType === "number" && (
            <NumberConfigForm value={numberConfig} onChange={setNumberConfig} />
          )}
          {fieldType === "colour" && (
            <ColourConfigForm
              productId={productId}
              value={colourConfig}
              onChange={setColourConfig}
            />
          )}
          {fieldType === "select" && (
            <SelectConfigForm
              value={selectConfig}
              onChange={setSelectConfig}
              fieldId={mode === "edit" ? initialField?.id : undefined}
              onSaveFieldFirst={mode === "add" ? handleSave : undefined}
            />
          )}
          {/* Quick task 260430-icx — Quill rich-text editor for textarea fields. */}
          {fieldType === "textarea" && (
            <NovelRichTextEditor
              value={textareaConfig.html ?? ""}
              onChange={(html) => setTextareaConfig({ html })}
            />
          )}
          </div>
        </>
      )}

      {/* Footer buttons */}
      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={pending || !fieldType}
          className="min-h-[44px]"
          style={{ backgroundColor: BRAND.green, color: "white" }}
        >
          {pending ? "Saving…" : mode === "add" ? "Add field" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal — wraps ConfigFieldFormBody in a Dialog.
// Used for non-locked fields (admin-added extras).
// ---------------------------------------------------------------------------

export function ConfigFieldModal({
  open,
  onOpenChange,
  productId,
  mode,
  initialField,
  onSaved,
}: Props) {
  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[560px] w-[94vw] p-6">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add config field" : `Edit field: ${initialField?.label}`}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {mode === "add"
              ? "Choose a field type, then configure it."
              : "Update the field settings below."}
          </DialogDescription>
        </DialogHeader>

        <ConfigFieldFormBody
          productId={productId}
          mode={mode}
          initialField={initialField}
          onSaved={async (savedField) => {
            await onSaved(savedField);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
