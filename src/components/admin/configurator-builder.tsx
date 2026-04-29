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
import { ConfigFieldModal } from "@/components/admin/config-field-modal";
import { TierTableEditor } from "@/components/admin/tier-table-editor";
import {
  getConfiguratorData,
  deleteConfigField,
  reorderConfigFields,
  updateConfigField,
  type ConfigField,
} from "@/actions/configurator";
import { BRAND } from "@/lib/brand";

// ============================================================================
// Types
// ============================================================================

type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  productType: "stocked" | "configurable" | "keychain";
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
};

// ============================================================================
// ConfiguratorBuilder
// ============================================================================

export function ConfiguratorBuilder({ initial }: BuilderProps) {
  const [fields, setFields] = useState<ConfigField[]>(initial.fields);
  const [product] = useState<ProductSummary>(initial.product);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<ConfigField | null>(null);

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
  // -------------------------------------------------------------------------
  const moveField = (index: number, direction: "up" | "down") => {
    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
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
            Configurator
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define the fields customers fill in when ordering this product.
          </p>
        </div>
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
            <div
              key={field.id}
              className="flex items-center gap-3 rounded-xl border bg-white p-4"
              style={{ borderColor: "#E4E4E7" }}
            >
              {/* Drag handle (visual) */}
              <GripVertical
                className="h-4 w-4 text-slate-300 shrink-0 cursor-grab"
                aria-hidden
              />

              {/* Up/Down reorder */}
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

              {/* Edit */}
              <button
                type="button"
                onClick={() => {
                  setEditingField(field);
                  setEditModalOpen(true);
                }}
                disabled={pending}
                aria-label={`Edit ${field.label}`}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Pencil className="h-4 w-4" />
              </button>

              {/* Delete */}
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
        onSaved={async () => {
          setAddModalOpen(false);
          await refetch(); // Pattern B
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
          onSaved={async () => {
            setEditModalOpen(false);
            setEditingField(null);
            await refetch(); // Pattern B
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
    </div>
  );
}
