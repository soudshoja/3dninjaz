"use client";

/**
 * Phase 16/17 — Admin variant editor.
 *
 * ============================================================================
 * REACTIVITY CONTRACT (AD-06, Phase 17)
 * ============================================================================
 * Every admin mutation MUST update the rendered UI without a hard page
 * navigation. Two allowed patterns:
 *
 * Pattern A — Optimistic local update (idempotent field edits):
 *   1. Capture pre-mutation snapshot.
 *   2. setVariants / setOptions optimistically BEFORE the server call returns.
 *   3. Server action inside startTransition.
 *   4. On error: rollback to snapshot + showToast. On success: no-op.
 *
 * Pattern B — Server refetch via getVariantEditorData (shape-changing ops):
 *   1. Server action inside startTransition.
 *   2. On success: getVariantEditorData(productId) → replace options + variants.
 *   3. On error: showToast; do NOT replace.
 *
 * NEVER call router.refresh() — the server component page.tsx renders once
 * with initial data; subsequent state is client-owned.
 *
 * Mutation → pattern mapping:
 *   add/rename/delete option     → B
 *   add/rename/delete value      → B
 *   generate matrix              → B
 *   update variant field         → A (optimistic + rollback)
 *   delete variant               → A (filter + rollback)
 *   upload variant image         → A (optimistic imageUrl patch)
 *   remove variant image         → A
 *   set default variant          → B (server sets single default across siblings)
 *   bulk edit (price/sale/etc)   → B
 * ============================================================================
 *
 * Top section:   options editor (add/rename/delete option + values, swatch picker)
 * Middle:        "Generate variant matrix" button
 * Bulk toolbar:  set-all / multiply / add-price / set-sale / toggle-active / delete
 * Bottom:        variant matrix table (inline edit: price, sale, stock, SKU, weight, image, default, active)
 */

import { useState, useTransition, useCallback, useRef } from "react";
import { Pencil, Trash2, Plus, RefreshCw, Star, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/format";
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
  getVariantEditorData,
  uploadVariantImage,
  removeVariantImage,
  setDefaultVariant,
  bulkUpdateVariants,
  type BulkOp,
} from "@/actions/variants";
import type { HydratedOption, HydratedVariant } from "@/lib/variants";
import { generateVariantSku } from "@/lib/sku";

interface VariantEditorProps {
  productId: string;
  productSlug: string;
  initialOptions: HydratedOption[];
  initialVariants: HydratedVariant[];
}

export function VariantEditor({ productId, productSlug, initialOptions, initialVariants }: VariantEditorProps) {
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

  // Phase 17 — bulk edit state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<"idle" | "set-price" | "multiply" | "add" | "sale">("idle");
  const [bulkValue, setBulkValue] = useState("");
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Pattern B: refetch after shape-changing ops
  const refresh = useCallback(async () => {
    const result = await getVariantEditorData(productId);
    if ("data" in result && result.data) {
      setOptions(result.data.options);
      setVariants(result.data.variants);
    } else if ("error" in result) {
      showToast("Failed to refresh editor data", "error");
    }
    // NOTE: router.refresh() intentionally removed (AD-06)
  }, [productId, showToast]);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === variants.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(variants.map((v) => v.id)));
    }
  };

  // ---------------------------------------------------------------------------
  // Option actions (Pattern B)
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
        await refresh();
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
        await refresh();
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
        await refresh();
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Option value actions (Pattern B)
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
        await refresh();
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
        await refresh();
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Variant matrix (Pattern B)
  // ---------------------------------------------------------------------------

  const handleGenerateMatrix = () => {
    startTransition(async () => {
      const result = await generateVariantMatrix(productId);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast(`Matrix generated — ${result.data?.inserted ?? 0} new variants added`);
        await refresh();
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Variant field edit (Pattern A — optimistic + rollback)
  // ---------------------------------------------------------------------------

  const handleUpdateVariantField = (variantId: string, field: string, value: unknown) => {
    const prev = variants; // snapshot for rollback
    setVariants((p) =>
      p.map((v) => (v.id === variantId ? { ...v, [field]: value } : v)),
    );
    startTransition(async () => {
      const result = await updateVariant(variantId, { [field]: value });
      if ("error" in result) {
        setVariants(prev); // rollback
        showToast(result.error, "error");
      }
    });
  };

  const handleDeleteVariant = (variantId: string) => {
    const prev = variants; // snapshot for rollback
    setVariants((p) => p.filter((v) => v.id !== variantId));
    setSelectedIds((s) => { const n = new Set(s); n.delete(variantId); return n; });
    startTransition(async () => {
      const result = await deleteVariant(variantId);
      if ("error" in result) {
        setVariants(prev); // rollback
        showToast(result.error, "error");
      } else {
        showToast("Variant deleted");
        // Phase 18 (Issue 3 fix) — defensive refetch so the editor never
        // diverges from server state after a delete. Without this, if a
        // prior optimistic update had failed without surfacing, the "zombie"
        // row could reappear after the next Pattern B refresh.
        await refresh();
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Image upload / remove (Pattern A)
  // ---------------------------------------------------------------------------

  const handleUploadImage = (variantId: string, file: File) => {
    setUploadingIds((s) => new Set(s).add(variantId));
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadVariantImage(variantId, fd);
      setUploadingIds((s) => { const n = new Set(s); n.delete(variantId); return n; });
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        const prev = variants;
        setVariants((p) =>
          p.map((v) =>
            v.id === variantId ? { ...v, imageUrl: result.data!.imageUrl } : v,
          ),
        );
        void prev; // rollback not needed — successful update
        showToast("Image uploaded");
      }
    });
  };

  const handleRemoveImage = (variantId: string) => {
    const prev = variants;
    setVariants((p) =>
      p.map((v) => (v.id === variantId ? { ...v, imageUrl: null } : v)),
    );
    startTransition(async () => {
      const result = await removeVariantImage(variantId);
      if ("error" in result) {
        setVariants(prev); // rollback
        showToast(result.error, "error");
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Set default variant (Pattern B)
  // ---------------------------------------------------------------------------

  const handleSetDefault = (variantId: string) => {
    startTransition(async () => {
      const result = await setDefaultVariant(variantId);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast("Default variant set");
        await refresh();
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Bulk ops (Pattern B)
  // ---------------------------------------------------------------------------

  const handleBulkOp = (op: BulkOp) => {
    if (selectedIds.size === 0) return;
    startTransition(async () => {
      const result = await bulkUpdateVariants(productId, Array.from(selectedIds), op);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast(`Bulk op applied to ${result.data?.affected ?? 0} variants`);
        setBulkMode("idle");
        setBulkValue("");
        if (op.kind === "delete") setSelectedIds(new Set());
        await refresh();
      }
    });
  };

  const hasAllValues = options.length > 0 && options.every((o) => o.values.length > 0);
  const allSelected = variants.length > 0 && selectedIds.size === variants.length;

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
            Options ({options.length})
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
        {options.length < 6 && (
          <div className="flex gap-2">
            <Input
              placeholder="New option name (e.g., Size, Color, Material, Part)"
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
          <div className="p-4 border-b border-[var(--color-brand-border)] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-brand-text-primary)]">
              Variants ({variants.length})
              {selectedIds.size > 0 && (
                <span className="ml-2 text-sm font-normal text-[var(--color-brand-text-muted)]">
                  {selectedIds.size} selected
                </span>
              )}
            </h2>
          </div>

          {/* Bulk toolbar — shown when at least 1 row selected */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-3 border-b border-[var(--color-brand-border)] bg-blue-50 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-blue-700 mr-2">Bulk ({selectedIds.size}):</span>

              {bulkMode === "idle" ? (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkMode("set-price")}>Set price</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkMode("multiply")}>Multiply %</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkMode("add")}>Add MYR</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkMode("sale")}>Set sale</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkOp({ kind: "set-active", inStock: true })} disabled={isPending}>Activate</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkOp({ kind: "set-active", inStock: false })} disabled={isPending}>Deactivate</Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleBulkOp({ kind: "delete" })} disabled={isPending}>Delete</Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-blue-700">
                    {bulkMode === "set-price" ? "Set price to MYR" :
                     bulkMode === "multiply" ? "Multiply by %" :
                     bulkMode === "add" ? "Add MYR (negative to subtract)" :
                     "Set sale price to MYR (blank to clear)"}
                  </span>
                  <Input
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="h-7 w-28 text-xs"
                    placeholder={bulkMode === "multiply" ? "e.g. 110" : "e.g. 25.00"}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (bulkMode === "set-price") handleBulkOp({ kind: "set-price", value: bulkValue });
                        else if (bulkMode === "multiply") handleBulkOp({ kind: "multiply-price", percent: parseFloat(bulkValue) });
                        else if (bulkMode === "add") handleBulkOp({ kind: "add-price", delta: bulkValue });
                        else if (bulkMode === "sale") handleBulkOp({ kind: "set-sale-price", value: bulkValue || null });
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={isPending}
                    onClick={() => {
                      if (bulkMode === "set-price") handleBulkOp({ kind: "set-price", value: bulkValue });
                      else if (bulkMode === "multiply") handleBulkOp({ kind: "multiply-price", percent: parseFloat(bulkValue) });
                      else if (bulkMode === "add") handleBulkOp({ kind: "add-price", delta: bulkValue });
                      else if (bulkMode === "sale") handleBulkOp({ kind: "set-sale-price", value: bulkValue || null });
                    }}
                  >Apply</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setBulkMode("idle"); setBulkValue(""); }}>Cancel</Button>
                </>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-brand-surface)] text-[var(--color-brand-text-muted)]">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded"
                      title="Select all"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Variant</th>
                  <th className="text-left px-4 py-3 font-medium">Price (MYR)</th>
                  <th className="text-left px-4 py-3 font-medium">Sale price</th>
                  <th className="text-left px-4 py-3 font-medium">Stock</th>
                  <th className="text-left px-4 py-3 font-medium">Track</th>
                  <th className="text-left px-4 py-3 font-medium" title="When tracked AND stock=0, allow pre-order keeps the variant visible. Default off — hides OOS variants from PDP.">Pre-order</th>
                  <th className="text-left px-4 py-3 font-medium">Active</th>
                  <th className="text-left px-4 py-3 font-medium">Default</th>
                  <th className="text-left px-4 py-3 font-medium">SKU</th>
                  <th className="text-left px-4 py-3 font-medium">Weight (g)</th>
                  <th className="text-left px-4 py-3 font-medium">Image</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-brand-border)]">
                {variants.map((v) => (
                  <VariantRow
                    key={v.id}
                    variant={v}
                    productSlug={productSlug}
                    isSelected={selectedIds.has(v.id)}
                    onToggleSelect={toggleSelect}
                    onUpdate={handleUpdateVariantField}
                    onDelete={handleDeleteVariant}
                    onSetDefault={handleSetDefault}
                    onUploadImage={handleUploadImage}
                    onRemoveImage={handleRemoveImage}
                    isUploading={uploadingIds.has(v.id)}
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
            <DialogTitle>Delete option &quot;{deleteOptionDialog?.name}&quot;?</DialogTitle>
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
            <DialogTitle>Delete value &quot;{deleteValueDialog?.value}&quot;?</DialogTitle>
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
  productSlug,
  isSelected,
  onToggleSelect,
  onUpdate,
  onDelete,
  onSetDefault,
  onUploadImage,
  onRemoveImage,
  isUploading,
  isPending,
}: {
  variant: HydratedVariant;
  productSlug: string;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdate: (variantId: string, field: string, value: unknown) => void;
  onDelete: (variantId: string) => void;
  onSetDefault: (variantId: string) => void;
  onUploadImage: (variantId: string, file: File) => void;
  onRemoveImage: (variantId: string) => void;
  isUploading: boolean;
  isPending: boolean;
}) {
  const [price, setPrice] = useState(variant.price);
  const [salePrice, setSalePrice] = useState(variant.salePrice ?? "");
  const [sku, setSku] = useState(variant.sku ?? "");
  const [weightG, setWeightG] = useState(variant.weightG !== null ? String(variant.weightG) : "");
  const [showSchedule, setShowSchedule] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep local state in sync when variant prop changes (e.g. after bulk refetch)
  const prevVariantRef = useRef(variant);
  if (prevVariantRef.current.id !== variant.id || prevVariantRef.current.price !== variant.price) {
    setPrice(variant.price);
    prevVariantRef.current = variant;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadImage(variant.id, file);
    // reset input so same file can be re-uploaded
    e.target.value = "";
  };

  return (
    <tr className={`hover:bg-[var(--color-brand-surface-hover)] ${isSelected ? "bg-blue-50" : ""}`}>
      {/* Checkbox */}
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(variant.id)}
          className="rounded"
        />
      </td>

      {/* Variant label */}
      <td className="px-4 py-3 font-medium text-[var(--color-brand-text-primary)] min-w-[120px]">
        {variant.label || <span className="text-[var(--color-brand-text-muted)] italic">unlabeled</span>}
      </td>

      {/* Price */}
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

      {/* Sale price */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <Input
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            onBlur={() => {
              const val = salePrice.trim();
              const current = variant.salePrice ?? "";
              if (val !== current) {
                onUpdate(variant.id, "salePrice", val || null);
              }
            }}
            placeholder="—"
            className="h-8 w-24 text-sm"
          />
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline text-left"
            onClick={() => setShowSchedule((s) => !s)}
          >
            {showSchedule ? "▲ Hide schedule" : "▼ Schedule"}
          </button>
          {showSchedule && (
            <div className="flex flex-col gap-1 mt-1">
              {/* Phase 18 — inputs now use browser local timezone. The server
                  still stores UTC; toDatetimeLocal/fromDatetimeLocal convert. */}
              <label className="text-xs text-[var(--color-brand-text-muted)]">From (your timezone)</label>
              <input
                type="datetime-local"
                defaultValue={toDatetimeLocal(variant.saleFrom)}
                onBlur={(e) => {
                  const isoUtc = fromDatetimeLocal(e.target.value);
                  onUpdate(variant.id, "saleFrom", isoUtc);
                }}
                className="h-7 text-xs border rounded px-1"
              />
              <label className="text-xs text-[var(--color-brand-text-muted)]">To (your timezone)</label>
              <input
                type="datetime-local"
                defaultValue={toDatetimeLocal(variant.saleTo)}
                onBlur={(e) => {
                  const isoUtc = fromDatetimeLocal(e.target.value);
                  onUpdate(variant.id, "saleTo", isoUtc);
                }}
                className="h-7 text-xs border rounded px-1"
              />
            </div>
          )}
        </div>
      </td>

      {/* Stock */}
      <td className="px-4 py-3">
        <Input
          type="number"
          value={variant.stock}
          onChange={(e) => onUpdate(variant.id, "stock", parseInt(e.target.value, 10) || 0)}
          className="h-8 w-20 text-sm"
          min={0}
        />
      </td>

      {/* Track stock */}
      <td className="px-4 py-3">
        <Switch
          checked={variant.trackStock}
          onCheckedChange={(checked) => onUpdate(variant.id, "trackStock", checked)}
          disabled={isPending}
        />
      </td>

      {/* Phase 18 — Pre-order toggle */}
      <td className="px-4 py-3">
        <Switch
          checked={variant.allowPreorder}
          onCheckedChange={(checked) => onUpdate(variant.id, "allowPreorder", checked)}
          disabled={isPending}
        />
      </td>

      {/* Active (inStock) */}
      <td className="px-4 py-3">
        <Switch
          checked={variant.inStock}
          onCheckedChange={(checked) => onUpdate(variant.id, "inStock", checked)}
          disabled={isPending}
        />
      </td>

      {/* Default toggle — star icon */}
      <td className="px-4 py-3">
        <button
          type="button"
          title={variant.isDefault ? "Default variant" : "Set as default"}
          onClick={() => onSetDefault(variant.id)}
          disabled={isPending}
          className="p-1 rounded hover:bg-yellow-50 transition"
        >
          <Star
            className="h-4 w-4"
            fill={variant.isDefault ? "#f59e0b" : "none"}
            stroke={variant.isDefault ? "#f59e0b" : "#9ca3af"}
          />
        </button>
      </td>

      {/* SKU */}
      <td className="px-4 py-3">
        {(() => {
          const valueLabels = variant.label
            ? variant.label.split(" / ").filter(Boolean)
            : [];
          const autoSku = generateVariantSku(productSlug, valueLabels);
          return (
            <div className="flex flex-col gap-0.5">
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                onBlur={() => {
                  if (sku !== (variant.sku ?? "")) {
                    onUpdate(variant.id, "sku", sku || null);
                  }
                }}
                placeholder={autoSku}
                className="h-8 w-36 text-sm font-mono"
              />
              {!sku && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline text-left"
                  onClick={() => {
                    setSku(autoSku);
                    onUpdate(variant.id, "sku", autoSku);
                  }}
                >
                  Use auto
                </button>
              )}
            </div>
          );
        })()}
      </td>

      {/* Weight (g) — AD-08 */}
      <td className="px-4 py-3">
        <Input
          type="number"
          value={weightG}
          onChange={(e) => setWeightG(e.target.value)}
          onBlur={() => {
            const num = weightG.trim() === "" ? null : parseInt(weightG, 10);
            const current = variant.weightG;
            if (num !== current) {
              onUpdate(variant.id, "weightG", num);
            }
          }}
          placeholder="inherit"
          title="Weight in grams. Leave blank to inherit product weight."
          className="h-8 w-24 text-sm"
          min={0}
          max={50000}
        />
      </td>

      {/* Image */}
      <td className="px-4 py-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {variant.imageUrl ? (
          <div className="flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${variant.imageUrl}/800w.jpg`}
              alt="variant"
              className="h-8 w-8 object-cover rounded border"
              onError={(e) => { (e.target as HTMLImageElement).src = variant.imageUrl!; }}
            />
            <button
              type="button"
              title="Remove image"
              onClick={() => onRemoveImage(variant.id)}
              disabled={isPending}
              className="text-red-400 hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || isUploading}
          >
            {isUploading ? "…" : <><Upload className="h-3 w-3 mr-1" />Upload</>}
          </Button>
        )}
      </td>

      {/* Delete */}
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
