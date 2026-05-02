"use client";

/**
 * Phase 19-04 — Admin configurator builder.
 *
 * ============================================================================
 * REACTIVITY CONTRACT (Phase 17 AD-06 inheritance)
 * ============================================================================
 * Pattern A — Optimistic (idempotent ops like rename/required toggle):
 *   1. setFields() optimistically BEFORE server call.
 *   2. On error: rollback + show error.
 *   3. On success: no further refetch needed.
 *
 * Pattern B — Server refetch via getConfiguratorData (shape-changing ops):
 *   add field, delete field, reorder fields, save tier table.
 *   1. Server action inside startTransition.
 *   2. On success: getConfiguratorData() → replace fields state.
 *   3. On error: show error; do NOT replace.
 *
 * NEVER force a page reload — page state is client-owned after initial hydration.
 * ============================================================================
 */

import { useState, useTransition, useCallback } from "react";
import {
  GripVertical,
  Pencil,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ConfigFieldModal, ConfigFieldFormBody } from "@/components/admin/config-field-modal";
import { ColourFillConfirmationDialog, type ColourFillPrompt } from "@/components/admin/colour-fill-confirmation-dialog";
import { TierTableEditor } from "@/components/admin/tier-table-editor";
import {
  getConfiguratorData,
  deleteConfigField,
  reorderConfigFields,
  updateConfigField,
  type ConfigField,
} from "@/actions/configurator";
import { getActiveColoursForPicker } from "@/actions/admin-colours";
import { BRAND } from "@/lib/brand";

// ============================================================================
// Types
// ============================================================================

type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  productType: "stocked" | "configurable" | "keychain" | "vending" | "simple";
  maxUnitCount: number | null;
  priceTiers: Record<string, number>;
  unitField: string | null;
};

type BuilderProps = {
  initial: {
    product: ProductSummary;
    fields: ConfigField[];
  };
};

// ============================================================================
// Field type badge colors
// ============================================================================

const TYPE_COLORS: Record<string, string> = {
  text: "#3B82F6",
  number: "#8B5CF6",
  colour: "#EC4899",
  select: "#F59E0B",
  // Quick task 260430-icx — textarea (rich text) fields.
  textarea: "#10B981",
};

// ============================================================================
// ConfiguratorBuilder
// ============================================================================

export function ConfiguratorBuilder({ initial }: BuilderProps) {
  const [fields, setFields] = useState<ConfigField[]>(initial.fields);
  const [product] = useState<ProductSummary>(initial.product);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Modal state (non-locked fields)
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<ConfigField | null>(null);

  // Cross-axis colour fill queue — sequential prompt after a colour field saves.
  const [fillQueue, setFillQueue] = useState<ColourFillPrompt[]>([]);

  // Inline drawer state (locked fields)
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  // Delete confirm dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingField, setDeletingField] = useState<ConfigField | null>(null);

  // Tier section collapsed/expanded
  const [tierOpen, setTierOpen] = useState(
    Object.keys(initial.product.priceTiers).length > 0 || initial.product.maxUnitCount !== null
  );

  // -------------------------------------------------------------------------
  // Pattern B refetch helper
  // -------------------------------------------------------------------------
  const refetch = useCallback(async () => {
    const data = await getConfiguratorData(product.id);
    setFields(data.fields);
  }, [product.id]);

  // -------------------------------------------------------------------------
  // Reorder: Up/Down buttons → Pattern B
  // Locked fields cannot be reordered — skip if either source or target is locked.
  // -------------------------------------------------------------------------
  const moveField = (index: number, direction: "up" | "down") => {
    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    // Do not allow moving a locked field or swapping into a locked field's slot
    if (newFields[index].locked || newFields[targetIndex].locked) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    const orderedIds = newFields.map((f) => f.id);

    startTransition(async () => {
      setError(null);
      // Optimistic local update first
      setFields(newFields);
      const result = await reorderConfigFields(product.id, orderedIds);
      if (!result.ok) {
        setError(result.error);
        // Rollback
        setFields(fields);
      } else {
        await refetch();
      }
    });
  };

  // -------------------------------------------------------------------------
  // Required toggle: Pattern A optimistic
  // -------------------------------------------------------------------------
  const toggleRequired = (fieldId: string, newRequired: boolean) => {
    const snapshot = fields;
    // Optimistic update
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, required: newRequired } : f))
    );

    startTransition(async () => {
      setError(null);
      const result = await updateConfigField(fieldId, { required: newRequired });
      if (!result.ok) {
        setError(result.error);
        setFields(snapshot); // rollback
      }
    });
  };

  // -------------------------------------------------------------------------
  // Cross-axis colour fill queue builder (async — fetches colour catalogue
  // once to resolve names + hex for the swatch chips in the dialog).
  // Called after any colour field saves; produces sequential prompts for
  // every OTHER colour field that is missing one or more of the new colours.
  // -------------------------------------------------------------------------
  const buildFillQueue = useCallback(
    async (
      sourceFieldId: string,
      newAllowedColorIds: string[],
      currentFields: ConfigField[],
    ): Promise<ColourFillPrompt[]> => {
      if (newAllowedColorIds.length === 0) return [];

      // Fetch catalogue once so swatches show real names + hex values.
      const catalogue = await getActiveColoursForPicker().catch(() => []);
      const rowById = new Map(catalogue.map((r) => [r.id, r]));

      const prompts: ColourFillPrompt[] = [];

      for (const other of currentFields) {
        if (other.id === sourceFieldId) continue;
        if (other.fieldType !== "colour") continue;

        const existingIds = new Set(
          ((other.config as { allowedColorIds?: string[] }).allowedColorIds ?? []),
        );
        const toAddIds = newAllowedColorIds.filter((id) => !existingIds.has(id));
        if (toAddIds.length === 0) continue;

        const capturedOtherId = other.id;
        const capturedOtherLabel = other.label;
        const capturedExisting = Array.from(existingIds);

        prompts.push({
          targetAxisLabel: capturedOtherLabel,
          coloursToAdd: toAddIds.map((id) => {
            const row = rowById.get(id);
            return {
              id,
              name: row?.name ?? id,
              hex: row?.hex ?? "#E0E0E0",
            };
          }),
          onConfirm: async () => {
            const merged = Array.from(new Set([...capturedExisting, ...toAddIds]));
            await updateConfigField(capturedOtherId, {
              config: { allowedColorIds: merged },
            });
            await refetch();
            setFillQueue((q) => q.slice(1));
          },
          onSkip: () => {
            setFillQueue((q) => q.slice(1));
          },
        });
      }

      return prompts;
    },
    [refetch],
  );

  // -------------------------------------------------------------------------
  // Auto-fill Clicker + Letter palettes when Base palette is saved.
  // Pulls a fresh field list from the server before filtering so a stale
  // closure can't drop targets. Any per-target failure surfaces as a visible
  // error so silent partial-fills can't happen.
  // -------------------------------------------------------------------------
  const handleBaseAutoFill = async (
    savedField: ConfigField,
  ) => {
    if (savedField.label !== "Base") return;
    const newBaseIds = (savedField.config as { allowedColorIds?: string[] }).allowedColorIds ?? [];
    if (newBaseIds.length === 0) return;

    const fresh = await getConfiguratorData(product.id);
    const targets = fresh.fields.filter(
      (f) => f.fieldType === "colour" && (f.label === "Clicker" || f.label === "Letter"),
    );

    const failures: string[] = [];
    for (const target of targets) {
      const result = await updateConfigField(target.id, {
        config: { allowedColorIds: newBaseIds },
      });
      if (!result.ok) {
        failures.push(`${target.label}: ${result.error}`);
      }
    }

    await refetch();

    if (failures.length > 0) {
      setError(`Auto-fill failed for: ${failures.join("; ")}`);
    } else if (targets.length === 0) {
      setError(`Auto-fill found no Clicker/Letter targets to update.`);
    }
  };

  // -------------------------------------------------------------------------
  // Delete: Pattern B after confirm
  // -------------------------------------------------------------------------
  const handleDeleteConfirm = () => {
    if (!deletingField) return;
    const fieldToDelete = deletingField;
    setDeleteConfirmOpen(false);
    setDeletingField(null);

    startTransition(async () => {
      setError(null);
      const result = await deleteConfigField(fieldToDelete.id);
      if (!result.ok) {
        setError(result.error);
      } else {
        await refetch(); // Pattern B
      }
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isKeychain = product.productType === "keychain";
  const isVending = product.productType === "vending";

  const textAndNumberFields = fields.filter(
    (f) => f.fieldType === "text" || f.fieldType === "number"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <a
              href={`/admin/products/${product.id}/edit`}
              className="hover:underline"
            >
              ← Back to {product.name}
            </a>
          </div>
          <h1 className="font-heading text-2xl font-bold" style={{ color: BRAND.ink }}>
            {isKeychain ? "Keyboard Clicker fields" : isVending ? "Vending Machine fields" : "Configurator"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isKeychain
              ? "Pre-seeded with Base, Clicker, and Letter colour fields (locked). Add extra fields such as a name text field via \"Add field\"."
              : isVending
                ? "Pre-seeded with Primary and Secondary colour fields (locked). Use the colour gallery on each field to pick which colours customers can choose."
                : "Define the fields customers fill in when ordering this product."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/products/${product.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50 transition-colors min-h-[44px]"
            style={{ borderColor: BRAND.blue, color: BRAND.blue }}
          >
            <ExternalLink className="h-4 w-4" />
            View product
          </a>
          <Button
            onClick={() => setAddModalOpen(true)}
            disabled={pending}
            className="min-h-[44px] gap-2"
            style={{ backgroundColor: BRAND.green, color: "white" }}
          >
            <Plus className="h-4 w-4" />
            Add field
            {fields.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 text-xs"
                style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
              >
                {fields.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

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

      {/* Pricing tiers section */}
      <div className="rounded-xl border" style={{ borderColor: "#E4E4E7" }}>
        <button
          type="button"
          onClick={() => setTierOpen((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left font-semibold hover:bg-slate-50 transition-colors rounded-xl"
          style={{ color: BRAND.ink }}
        >
          <span>Pricing tiers</span>
          {tierOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {tierOpen && (
          <div className="border-t px-4 pb-4 pt-3">
            <TierTableEditor
              productId={product.id}
              initialMaxUnitCount={product.maxUnitCount}
              initialPriceTiers={product.priceTiers}
              initialUnitField={product.unitField}
              fieldOptions={textAndNumberFields.map((f) => ({
                id: f.id,
                label: f.label,
                fieldType: f.fieldType as "text" | "number",
              }))}
              onSaved={refetch}
            />
          </div>
        )}
      </div>

      {/* Field list */}
      <div className="space-y-2">
        {fields.length === 0 ? (
          <div
            className="rounded-xl border-2 border-dashed p-10 text-center"
            style={{ borderColor: "#E4E4E7" }}
          >
            <p className="font-semibold text-sm mb-1" style={{ color: BRAND.ink }}>
              No fields yet
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Click &ldquo;Add field&rdquo; to start building your configurator.
            </p>
            <Button
              onClick={() => setAddModalOpen(true)}
              variant="outline"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add first field
            </Button>
          </div>
        ) : (
            fields.map((field, index) => (
            <div key={field.id}>
              {/* Field row */}
              <div
                className="flex items-center gap-3 rounded-xl border bg-white p-4"
                style={{
                  borderColor: field.locked ? "#BFDBFE" : "#E4E4E7",
                  borderBottomLeftRadius: expandedFieldId === field.id ? 0 : undefined,
                  borderBottomRightRadius: expandedFieldId === field.id ? 0 : undefined,
                  borderBottomColor: expandedFieldId === field.id ? "transparent" : undefined,
                }}
              >
                {/* Drag handle (visual) — dimmed for locked fields */}
                <GripVertical
                  className={`h-4 w-4 shrink-0 ${field.locked ? "text-slate-200 cursor-default" : "text-slate-300 cursor-grab"}`}
                  aria-hidden
                />

                {/* Up/Down reorder — hidden for locked fields */}
                {field.locked ? (
                  <div className="w-[28px] shrink-0" aria-hidden />
                ) : (
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveField(index, "up")}
                      disabled={index === 0 || pending}
                      aria-label="Move up"
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 min-h-[28px]"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(index, "down")}
                      disabled={index === fields.length - 1 || pending}
                      aria-label="Move down"
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 min-h-[28px]"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Field info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm" style={{ color: BRAND.ink }}>
                      {field.label}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs capitalize"
                      style={{
                        borderColor: TYPE_COLORS[field.fieldType] ?? "#CBD5E1",
                        color: TYPE_COLORS[field.fieldType] ?? BRAND.ink,
                      }}
                    >
                      {field.fieldType}
                    </Badge>
                    {field.locked && (
                      <Badge
                        variant="secondary"
                        className="text-xs"
                        style={{ backgroundColor: "#DBEAFE", color: "#1D4ED8" }}
                      >
                        Locked
                      </Badge>
                    )}
                  </div>
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {field.helpText}
                    </p>
                  )}
                </div>

                {/* Required toggle (Pattern A optimistic) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:inline">Required</span>
                  <Switch
                    checked={field.required}
                    onCheckedChange={(v) => toggleRequired(field.id, v)}
                    disabled={pending}
                    aria-label={`${field.label} required`}
                  />
                </div>

                {/* Edit — locked fields use inline drawer, non-locked use modal */}
                <button
                  type="button"
                  onClick={() => {
                    if (field.locked) {
                      setExpandedFieldId((prev) =>
                        prev === field.id ? null : field.id,
                      );
                    } else {
                      setEditingField(field);
                      setEditModalOpen(true);
                    }
                  }}
                  disabled={pending}
                  aria-label={`Edit ${field.label}`}
                  aria-expanded={field.locked ? expandedFieldId === field.id : undefined}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  style={
                    field.locked && expandedFieldId === field.id
                      ? { color: BRAND.blue }
                      : undefined
                  }
                >
                  <Pencil className="h-4 w-4" />
                </button>

                {/* Delete — hidden for locked fields */}
                {!field.locked && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingField(field);
                      setDeleteConfirmOpen(true);
                    }}
                    disabled={pending}
                    aria-label={`Delete ${field.label}`}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Inline drawer — locked fields only, expands below row */}
              {field.locked && (
                <div
                  className="overflow-hidden transition-[max-height] duration-200 ease-out"
                  style={{
                    maxHeight: expandedFieldId === field.id ? "600px" : "0px",
                  }}
                  aria-hidden={expandedFieldId !== field.id}
                >
                  <div
                    className="rounded-b-xl border border-t-0 bg-white px-5 py-4"
                    style={{ borderColor: "#BFDBFE", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.04)" }}
                  >
                    {expandedFieldId === field.id && (
                      <ConfigFieldFormBody
                        productId={product.id}
                        mode="edit"
                        initialField={field}
                        onSaved={async (savedField) => {
                          setExpandedFieldId(null);
                          if (savedField && field.locked && field.label === "Base") {
                            await handleBaseAutoFill(savedField);
                          } else {
                            await refetch();
                            // Cross-axis fill prompt for non-Base colour fields
                            if (savedField && savedField.fieldType === "colour") {
                              const newIds = (savedField.config as { allowedColorIds?: string[] }).allowedColorIds ?? [];
                              // Fetch fresh field list AFTER refetch so buildFillQueue sees current state.
                              // setFields() in refetch() is async; reading `fields` here would be stale.
                              const fresh = await getConfiguratorData(product.id);
                              const queue = await buildFillQueue(savedField.id, newIds, fresh.fields);
                              if (queue.length > 0) setFillQueue(queue);
                            }
                          }
                        }}
                        onCancel={() => setExpandedFieldId(null)}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add field modal */}
      <ConfigFieldModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        productId={product.id}
        mode="add"
        onSaved={async (_savedField) => {
          setAddModalOpen(false);
          // Capture known field IDs before refetch so we can identify the new field.
          const knownIds = new Set(fields.map((f) => f.id));
          const fresh = await getConfiguratorData(product.id);
          setFields(fresh.fields);
          // Find the newly added colour field (if any).
          const newColourField = fresh.fields.find(
            (f) => !knownIds.has(f.id) && f.fieldType === "colour",
          );
          if (newColourField) {
            const newIds = (newColourField.config as { allowedColorIds?: string[] }).allowedColorIds ?? [];
            if (newIds.length > 0) {
              // New field has colours → push-direction: offer to add them to other fields.
              const queue = await buildFillQueue(newColourField.id, newIds, fresh.fields);
              if (queue.length > 0) setFillQueue(queue);
            } else {
              // New field is empty → pull-direction: offer to copy colours FROM each
              // existing colour field INTO the new one (one prompt per source).
              const catalogue = await getActiveColoursForPicker().catch(() => []);
              const rowById = new Map(catalogue.map((r) => [r.id, r]));
              const prompts: ColourFillPrompt[] = [];
              for (const other of fresh.fields) {
                if (other.id === newColourField.id) continue;
                if (other.fieldType !== "colour") continue;
                const srcIds = (other.config as { allowedColorIds?: string[] }).allowedColorIds ?? [];
                if (srcIds.length === 0) continue;
                const capturedNewId = newColourField.id;
                const capturedSrcIds = srcIds;
                const coloursToAdd = srcIds.map((id) => {
                  const row = rowById.get(id);
                  return { id, name: row?.name ?? id, hex: row?.hex ?? "#E0E0E0" };
                });
                prompts.push({
                  targetAxisLabel: newColourField.label,
                  coloursToAdd,
                  onConfirm: async () => {
                    await updateConfigField(capturedNewId, {
                      config: { allowedColorIds: capturedSrcIds },
                    });
                    await refetch();
                    setFillQueue((q) => q.slice(1));
                  },
                  onSkip: () => setFillQueue((q) => q.slice(1)),
                });
              }
              if (prompts.length > 0) setFillQueue(prompts);
            }
          }
        }}
      />

      {/* Edit field modal */}
      {editingField && (
        <ConfigFieldModal
          open={editModalOpen}
          onOpenChange={(v) => {
            setEditModalOpen(v);
            if (!v) setEditingField(null);
          }}
          productId={product.id}
          mode="edit"
          initialField={editingField}
          onSaved={async (savedField) => {
            setEditModalOpen(false);
            // Auto-fill Clicker + Letter when Base palette is saved
            if (savedField && editingField.locked && editingField.label === "Base") {
              await handleBaseAutoFill(savedField);
            } else {
              await refetch(); // Pattern B
              // Cross-axis fill prompt for non-Base colour fields
              if (savedField && savedField.fieldType === "colour") {
                const newIds = (savedField.config as { allowedColorIds?: string[] }).allowedColorIds ?? [];
                // Fetch fresh field list AFTER refetch so buildFillQueue sees current state.
                // setFields() in refetch() is async; reading `fields` here would be stale.
                const fresh = await getConfiguratorData(product.id);
                const queue = await buildFillQueue(savedField.id, newIds, fresh.fields);
                if (queue.length > 0) setFillQueue(queue);
              }
            }
            setEditingField(null);
          }}
        />
      )}

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete field?</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deletingField?.label}&rdquo;? This is irreversible. Existing orders
              retain their configuration snapshot (the FK cascade only removes the field
              definition, not historical order data).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={pending}
              style={{ backgroundColor: "#EF4444", color: "white" }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cross-axis colour fill sequential prompts */}
      <ColourFillConfirmationDialog
        queue={fillQueue}
        onResolveAll={() => setFillQueue([])}
      />
    </div>
  );
}
