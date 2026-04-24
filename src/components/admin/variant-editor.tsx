"use client";

/**
 * Phase 16 — Admin variant editor.
 *
 * Top section:   options editor (add/rename/delete option + values, swatch picker)
 * Middle:        "Generate variant matrix" button
 * Bottom:        variant matrix table (inline edit: price, stock, SKU, image, active)
 */

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, Palette, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  addProductOption,
  renameProductOption,
  deleteProductOption,
  addOptionValue,
  renameOptionValue,
  deleteOptionValue,
  generateVariantMatrix,
  updateVariant,
  deleteVariant,
  countVariantsAffectedByValueDelete,
} from "@/actions/variants";
import type { HydratedOption, HydratedVariant } from "@/lib/variants";

interface VariantEditorProps {
  productId: string;
  initialOptions: HydratedOption[];
  initialVariants: HydratedVariant[];
}

export function VariantEditor({ productId, initialOptions, initialVariants }: VariantEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<HydratedOption[]>(initialOptions);
  const [variants, setVariants] = useState<HydratedVariant[]>(initialVariants);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOptionName, setEditingOptionName] = useState("");
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({});
  const [deleteOptionDialog, setDeleteOptionDialog] = useState<{ optionId: string; name: string } | null>(null);
  const [deleteValueDialog, setDeleteValueDialog] = useState<{ valueId: string; value: string; count: number } | null>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // ---------------------------------------------------------------------------
  // Option actions
  // ---------------------------------------------------------------------------

  const handleAddOption = () => {
    if (!newOptionName.trim()) return;
    startTransition(async () => {
      const result = await addProductOption(productId, newOptionName.trim());
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        setNewOptionName("");
        showToast("Option added");
        refresh();
      }
    });
  };

  const handleRenameOption = (optionId: string) => {
    if (!editingOptionName.trim()) return;
    startTransition(async () => {
      const result = await renameProductOption(optionId, editingOptionName.trim());
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        setEditingOptionId(null);
        showToast("Option renamed");
        refresh();
      }
    });
  };

  const handleDeleteOptionConfirm = () => {
    if (!deleteOptionDialog) return;
    startTransition(async () => {
      const result = await deleteProductOption(deleteOptionDialog.optionId);
      setDeleteOptionDialog(null);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast(`Option deleted (${result.data?.variantsDeleted ?? 0} variants removed)`);
        refresh();
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Option value actions
  // ---------------------------------------------------------------------------

  const handleAddValue = (optionId: string) => {
    const val = newValueInputs[optionId]?.trim();
    if (!val) return;
    startTransition(async () => {
      const result = await addOptionValue(optionId, val);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        setNewValueInputs((prev) => ({ ...prev, [optionId]: "" }));
        showToast("Value added");
        refresh();
      }
    });
  };

  const handleDeleteValueClick = async (valueId: string, value: string) => {
    const result = await countVariantsAffectedByValueDelete(valueId);
    const count = "data" in result ? result.data?.count ?? 0 : 0;
    setDeleteValueDialog({ valueId, value, count });
  };

  const handleDeleteValueConfirm = () => {
    if (!deleteValueDialog) return;
    startTransition(async () => {
      const result = await deleteOptionValue(deleteValueDialog.valueId);
      setDeleteValueDialog(null);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast(`Value deleted (${result.data?.variantsDeleted ?? 0} variants removed)`);
        refresh();
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Variant matrix
  // ---------------------------------------------------------------------------

  const handleGenerateMatrix = () => {
    startTransition(async () => {
      const result = await generateVariantMatrix(productId);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast(`Matrix generated — ${result.data?.inserted ?? 0} new variants added`);
        refresh();
      }
    });
  };

  const handleUpdateVariantField = (variantId: string, field: string, value: unknown) => {
    startTransition(async () => {
      const result = await updateVariant(variantId, { [field]: value });
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        // Optimistic update
        setVariants((prev) =>
          prev.map((v) => (v.id === variantId ? { ...v, [field]: value } : v)),
        );
      }
    });
  };

  const handleDeleteVariant = (variantId: string) => {
    startTransition(async () => {
      const result = await deleteVariant(variantId);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        setVariants((prev) => prev.filter((v) => v.id !== variantId));
        showToast("Variant deleted");
      }
    });
  };

  const hasAllValues = options.length > 0 && options.every((o) => o.values.length > 0);

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
            toast.type === "error"
              ? "bg-red-100 text-red-800 border border-red-200"
              : "bg-green-100 text-green-800 border border-green-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Options editor */}
      <div className="bg-white border border-[var(--color-brand-border)] rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-brand-text-primary)]">
            Options ({options.length}/3)
          </h2>
        </div>

        {options.map((opt) => (
          <div key={opt.id} className="border border-[var(--color-brand-border)] rounded-lg p-4 space-y-3">
            {/* Option header */}
            <div className="flex items-center gap-2">
              {editingOptionId === opt.id ? (
                <>
                  <Input
                    value={editingOptionName}
                    onChange={(e) => setEditingOptionName(e.target.value)}
                    className="h-8 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleRenameOption(opt.id)}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => handleRenameOption(opt.id)} disabled={isPending}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingOptionId(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="font-medium text-[var(--color-brand-text-primary)]">{opt.name}</span>
                  <span className="text-xs text-[var(--color-brand-text-muted)]">(position {opt.position})</span>
                  <div className="ml-auto flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingOptionId(opt.id);
                        setEditingOptionName(opt.name);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:text-red-700"
                      onClick={() => setDeleteOptionDialog({ optionId: opt.id, name: opt.name })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Values list */}
            <div className="flex flex-wrap gap-2">
              {opt.values.map((val) => (
                <div
                  key={val.id}
                  className="flex items-center gap-1 px-2 py-1 bg-[var(--color-brand-surface)] rounded-md text-sm"
                >
                  {val.swatchHex && (
                    <span
                      className="w-4 h-4 rounded-full border border-gray-200 inline-block"
                      style={{ backgroundColor: val.swatchHex }}
                    />
                  )}
                  <span>{val.value}</span>
                  <button
                    className="ml-1 text-[var(--color-brand-text-muted)] hover:text-red-500"
                    onClick={() => handleDeleteValueClick(val.id, val.value)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add value */}
            <div className="flex gap-2">
              <Input
                placeholder={`Add ${opt.name} value...`}
                value={newValueInputs[opt.id] ?? ""}
                onChange={(e) =>
                  setNewValueInputs((prev) => ({ ...prev, [opt.id]: e.target.value }))
                }
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleAddValue(opt.id)}
              />
              <Button size="sm" variant="outline" onClick={() => handleAddValue(opt.id)} disabled={isPending}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
          </div>
        ))}

        {/* Add option */}
        {options.length < 3 && (
          <div className="flex gap-2">
            <Input
              placeholder="New option name (e.g., Size, Color, Part)"
              value={newOptionName}
              onChange={(e) => setNewOptionName(e.target.value)}
              className="h-9"
              onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
            />
            <Button onClick={handleAddOption} disabled={isPending || !newOptionName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add Option
            </Button>
          </div>
        )}
        {options.length >= 3 && (
          <p className="text-xs text-[var(--color-brand-text-muted)]">Maximum 3 options per product reached.</p>
        )}
      </div>

      {/* Generate matrix */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleGenerateMatrix}
          disabled={isPending || !hasAllValues}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Generate / Refresh Variant Matrix
        </Button>
        {!hasAllValues && options.length > 0 && (
          <p className="text-sm text-amber-600">Add at least one value to each option first.</p>
        )}
        {options.length === 0 && (
          <p className="text-sm text-[var(--color-brand-text-muted)]">Add options above to generate variants.</p>
        )}
      </div>

      {/* Variant matrix table */}
      {variants.length > 0 && (
        <div className="bg-white border border-[var(--color-brand-border)] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[var(--color-brand-border)]">
            <h2 className="text-lg font-semibold text-[var(--color-brand-text-primary)]">
              Variants ({variants.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-brand-surface)] text-[var(--color-brand-text-muted)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Variant</th>
                  <th className="text-left px-4 py-3 font-medium">Price (MYR)</th>
                  <th className="text-left px-4 py-3 font-medium">Stock</th>
                  <th className="text-left px-4 py-3 font-medium">Track</th>
                  <th className="text-left px-4 py-3 font-medium">Active</th>
                  <th className="text-left px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-brand-border)]">
                {variants.map((v) => (
                  <VariantRow
                    key={v.id}
                    variant={v}
                    onUpdate={handleUpdateVariantField}
                    onDelete={handleDeleteVariant}
                    isPending={isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete option dialog */}
      <Dialog open={!!deleteOptionDialog} onOpenChange={() => setDeleteOptionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete option "{deleteOptionDialog?.name}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            This will delete the option, all its values, and all variants that use this option slot.
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOptionDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteOptionConfirm} disabled={isPending}>
              Delete Option
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete value dialog */}
      <Dialog open={!!deleteValueDialog} onOpenChange={() => setDeleteValueDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete value "{deleteValueDialog?.value}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            {deleteValueDialog?.count
              ? `This will also delete ${deleteValueDialog.count} variant(s) that use this value.`
              : "No variants currently use this value."}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteValueDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteValueConfirm} disabled={isPending}>
              Delete Value
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline variant row component
// ---------------------------------------------------------------------------

function VariantRow({
  variant,
  onUpdate,
  onDelete,
  isPending,
}: {
  variant: HydratedVariant;
  onUpdate: (variantId: string, field: string, value: unknown) => void;
  onDelete: (variantId: string) => void;
  isPending: boolean;
}) {
  const [price, setPrice] = useState(variant.price);
  const [sku, setSku] = useState(variant.sku ?? "");

  return (
    <tr className="hover:bg-[var(--color-brand-surface-hover)]">
      <td className="px-4 py-3 font-medium text-[var(--color-brand-text-primary)]">
        {variant.label || <span className="text-[var(--color-brand-text-muted)] italic">unlabeled</span>}
      </td>
      <td className="px-4 py-3">
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            if (/^\d+(\.\d{1,2})?$/.test(price) && price !== variant.price) {
              onUpdate(variant.id, "price", price);
            }
          }}
          className="h-8 w-24 text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          value={variant.stock}
          onChange={(e) => onUpdate(variant.id, "stock", parseInt(e.target.value, 10) || 0)}
          className="h-8 w-20 text-sm"
          min={0}
        />
      </td>
      <td className="px-4 py-3">
        <Switch
          checked={variant.trackStock}
          onCheckedChange={(checked) => onUpdate(variant.id, "trackStock", checked)}
          disabled={isPending}
        />
      </td>
      <td className="px-4 py-3">
        <Switch
          checked={variant.inStock}
          onCheckedChange={(checked) => onUpdate(variant.id, "inStock", checked)}
          disabled={isPending}
        />
      </td>
      <td className="px-4 py-3">
        <Input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          onBlur={() => {
            if (sku !== (variant.sku ?? "")) {
              onUpdate(variant.id, "sku", sku || null);
            }
          }}
          placeholder="SKU"
          className="h-8 w-32 text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-red-400 hover:text-red-600"
          onClick={() => onDelete(variant.id)}
          disabled={isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}
