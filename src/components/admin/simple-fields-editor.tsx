"use client";

/**
 * Quick task 260430-icx — Admin editor for simple-product config fields.
 *
 * Lighter cousin of <ConfiguratorBuilder>:
 *   - No tier-pricing table (simple uses flat price, edited on the product
 *     edit form). Header instead shows the flat price as read-only summary.
 *   - All CRUD via shared configurator.ts actions (addConfigField,
 *     updateConfigField, deleteConfigField, reorderConfigFields). The
 *     server action layer sanitises textarea HTML on every save.
 *   - Pattern B refetch via getConfiguratorData() after every shape-change.
 *
 * Reactivity contract (Phase 17 AD-06): never call router.refresh().
 */
import { useState, useTransition, useCallback } from "react";
import {
  Pencil,
  Trash2,
  Plus,
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
import { ConfigFieldModal } from "@/components/admin/config-field-modal";
import {
  getConfiguratorData,
  deleteConfigField,
  reorderConfigFields,
  updateConfigField,
  type ConfigField,
} from "@/actions/configurator";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

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

type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  productType: "stocked" | "configurable" | "keychain" | "vending" | "simple";
  maxUnitCount: number | null;
  priceTiers: Record<string, number>;
  unitField: string | null;
};

type Props = {
  initial: {
    product: ProductSummary;
    fields: ConfigField[];
  };
};

export function SimpleFieldsEditor({ initial }: Props) {
  const [fields, setFields] = useState<ConfigField[]>(initial.fields);
  const product = initial.product;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<ConfigField | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingField, setDeletingField] = useState<ConfigField | null>(null);

  const flatPrice =
    typeof product.priceTiers["1"] === "number" ? product.priceTiers["1"] : null;

  const refetch = useCallback(async () => {
    const data = await getConfiguratorData(product.id);
    setFields(data.fields);
  }, [product.id]);

  const moveField = (index: number, direction: "up" | "down") => {
    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    const orderedIds = newFields.map((f) => f.id);
    startTransition(async () => {
      setError(null);
      setFields(newFields);
      const result = await reorderConfigFields(product.id, orderedIds);
      if (!result.ok) {
        setError(result.error);
        setFields(fields);
      } else {
        await refetch();
      }
    });
  };

  const toggleRequired = (fieldId: string, newRequired: boolean) => {
    const snapshot = fields;
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, required: newRequired } : f))
    );
    startTransition(async () => {
      setError(null);
      const result = await updateConfigField(fieldId, { required: newRequired });
      if (!result.ok) {
        setError(result.error);
        setFields(snapshot);
      }
    });
  };

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
        await refetch();
      }
    });
  };

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
          <h1
            className="font-heading text-2xl font-bold"
            style={{ color: BRAND.ink }}
          >
            Simple-product fields
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Add free-form fields customers fill in (text, number, colour,
            select), or rich-text content blocks (admin-authored, read-only on
            the storefront). No auto-seeded fields.
          </p>
          {flatPrice !== null && (
            <p className="text-sm font-semibold mt-2" style={{ color: BRAND.ink }}>
              Flat price:{" "}
              <span className="font-normal">{formatMYR(flatPrice)}</span>{" "}
              <a
                href={`/admin/products/${product.id}/edit`}
                className="text-xs ml-2 underline"
                style={{ color: BRAND.blue }}
              >
                Edit price
              </a>
            </p>
          )}
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
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  color: "white",
                }}
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

      {/* Fields list */}
      <div className="rounded-xl border" style={{ borderColor: "#E4E4E7" }}>
        {fields.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No fields yet. Click <strong>Add field</strong> to create your
            first one.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "#E4E4E7" }}>
            {fields.map((field, index) => {
              const colour = TYPE_COLORS[field.fieldType] ?? "#71717A";
              return (
                <li
                  key={field.id}
                  className="flex flex-wrap items-center gap-3 p-3 sm:p-4"
                >
                  {/* Reorder */}
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => moveField(index, "up")}
                      disabled={index === 0 || pending}
                      className="rounded p-0.5 disabled:opacity-30 hover:bg-slate-100"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(index, "down")}
                      disabled={index === fields.length - 1 || pending}
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

                  {/* Label + helpText */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-semibold text-sm truncate"
                      style={{ color: BRAND.ink }}
                    >
                      {field.label}
                    </p>
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground truncate">
                        {field.helpText}
                      </p>
                    )}
                  </div>

                  {/* Required toggle (textarea fields are admin content — no required toggle) */}
                  {field.fieldType !== "textarea" && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.required}
                        onCheckedChange={(v) => toggleRequired(field.id, v)}
                        disabled={pending}
                        aria-label="Required"
                      />
                      <span className="text-xs text-muted-foreground">
                        Required
                      </span>
                    </div>
                  )}

                  {/* Edit/Delete */}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingField(field);
                        setEditModalOpen(true);
                      }}
                      disabled={pending}
                      className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"
                      aria-label="Edit field"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingField(field);
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={pending}
                      className="rounded-lg p-2 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label="Delete field"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add modal */}
      <ConfigFieldModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        productId={product.id}
        mode="add"
        onSaved={async () => {
          setAddModalOpen(false);
          await refetch();
        }}
      />

      {/* Edit modal */}
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
            await refetch();
          }}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete field</DialogTitle>
            <DialogDescription>
              Permanently delete the field{" "}
              <strong>{deletingField?.label}</strong>? Any saved content for
              this field will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeletingField(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              style={{ backgroundColor: "#DC2626", color: "white" }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
