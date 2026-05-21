"use client";

/**
 * Phase 20 (20-09 rework) — Admin POS Builder — "quick-add modal" flow.
 *
 * Flow:
 *   1. Admin searches and picks a product → PosProductModal opens (real PDP)
 *   2. Admin configures options + qty → "Add to order" → modal closes → compact
 *      line appears in ticket
 *   3. Edit pencil on a line → reopens PosProductModal for that line's productId;
 *      on re-add, replaces that line (matched by localId)
 *   4. "Create order" → customer step modal (returning/new) → confirm → server
 *      action → PosSendDraftModal on success
 *
 * Layout: left = product search + custom-line button + ticket + coupon strip;
 * right (sticky) = summary card with Create order button.
 *
 * Autosave: lines + customerForm + couponCode + shippingOverride saved to
 * "admin-pos-draft" in localStorage with 1s debounce. DraftRestoredBanner shown
 * on mount when draft exists.
 *
 * Reactivity contract (Phase 17 AD-06):
 *   Pattern A optimistic — qty stepper, unit-price override.
 *   NEVER router.refresh() in any mutation path.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Package,
  Settings2,
  Keyboard,
  Pencil,
  ShoppingBag,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { MALAYSIAN_STATES } from "@/lib/validators";
import {
  createPosOrder,
  getPosProductSearch,
  type PosLine,
  type PosLineStocked,
  type PosLineConfigurable,
  type PosProductResult,
} from "@/actions/admin-pos";
import { DraftRestoredBanner } from "@/components/admin/draft-restored-banner";
import { PosLineRow, type LineWithId } from "@/components/admin/pos-line-row";
import { PosSendDraftModal } from "@/components/admin/pos-send-draft-modal";
import { PosProductModal } from "@/components/admin/pos-product-modal";
import { PosCustomerStep, type CustomerForm } from "@/components/admin/pos-customer-step";
import type { PosAddToOrderLine } from "@/components/store/product-detail";

// ─── Autosave ─────────────────────────────────────────────────────────────────

const AUTOSAVE_KEY = "admin-pos-draft";
const AUTOSAVE_DEBOUNCE_MS = 1000;

type DraftPayload = {
  savedAt: number;
  lines: LineWithId[];
  customerForm: CustomerForm;
  couponCode: string;
  shippingOverride: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function productTypeIcon(productType: string) {
  if (productType === "configurable") return <Settings2 size={16} />;
  if (productType === "keychain") return <Keyboard size={16} />;
  return <Package size={16} />;
}

function makeLocalId() {
  return Math.random().toString(36).slice(2);
}

function formatMYR(n: number) {
  return `RM ${n.toFixed(2)}`;
}

/** Map a PosAddToOrderLine (from ProductDetail) to a LineWithId for the ticket. */
function posAddToOrderToLineWithId(
  posLine: PosAddToOrderLine,
  localId: string,
): LineWithId {
  const configSummary = posLine.configurationData?.computedSummary ?? null;

  if (posLine.variantId) {
    // Stocked variant line
    const line: LineWithId = {
      localId,
      kind: "stocked",
      productId: posLine.productId,
      variantId: posLine.variantId,
      quantity: posLine.qty,
      unitPriceOverride: posLine.unitPrice,
      productName: posLine.productName,
      productImageUrl: posLine.productImageUrl ?? null,
      variantLabel: posLine.variantLabel ?? null,
      configSummary,
    };
    return line;
  } else {
    // Configurable / simple / keychain line
    const line: LineWithId = {
      localId,
      kind: "configurable",
      productId: posLine.productId,
      variantId: undefined,
      quantity: posLine.qty,
      computedUnitPrice: posLine.unitPrice,
      configurationData: posLine.configurationData
        ? JSON.stringify(posLine.configurationData.values)
        : "{}",
      productName: posLine.productName,
      productImageUrl: posLine.productImageUrl ?? null,
      variantLabel: posLine.variantLabel ?? null,
      configSummary,
    };
    return line;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PosBuilder() {
  // ── Lines ──────────────────────────────────────────────────────────────────

  const [lines, setLines] = useState<LineWithId[]>([]);

  // ── Customer form ──────────────────────────────────────────────────────────

  const [customerForm, setCustomerForm] = useState<CustomerForm>({
    name: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "Selangor",
    postcode: "",
  });

  // ── Coupon ─────────────────────────────────────────────────────────────────

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // ── Shipping override ──────────────────────────────────────────────────────

  const [shippingOverride, setShippingOverride] = useState<string>("");
  const [editingShipping, setEditingShipping] = useState(false);

  // ── Product modal ──────────────────────────────────────────────────────────

  const [modalProductId, setModalProductId] = useState<string | null>(null);
  /** If set, re-adding from the modal replaces the line with this localId */
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);

  // ── Customer step modal ────────────────────────────────────────────────────

  const [showCustomerStep, setShowCustomerStep] = useState(false);

  // ── Submit / send-draft ────────────────────────────────────────────────────

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sendDraftOpen, setSendDraftOpen] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);
  const [createdOrderTotal, setCreatedOrderTotal] = useState<number>(0);

  // ── Restore banner ─────────────────────────────────────────────────────────

  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number>(0);
  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);

  // ── Product picker ─────────────────────────────────────────────────────────

  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<PosProductResult[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Autosave: load on mount ────────────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTOSAVE_KEY);
      if (stored) {
        const draft: DraftPayload = JSON.parse(stored);
        setPendingDraft(draft);
        setDraftSavedAt(draft.savedAt ?? 0);
        setShowRestoreBanner(true);
      }
    } catch {
      // Corrupt draft — silently discard
    }
  }, []);

  // ── Autosave: debounced write ──────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const payload: DraftPayload = {
          savedAt: Date.now(),
          lines,
          customerForm,
          couponCode,
          shippingOverride,
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
      } catch {
        // localStorage quota exceeded — silently skip
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, customerForm, couponCode, shippingOverride]);

  // ── Product picker: debounced search ──────────────────────────────────────

  useEffect(() => {
    if (pickerDebounce.current) clearTimeout(pickerDebounce.current);
    if (!pickerQuery.trim()) {
      setPickerResults([]);
      setPickerLoading(false);
      return;
    }
    setPickerLoading(true);
    pickerDebounce.current = setTimeout(async () => {
      try {
        const results = await getPosProductSearch(pickerQuery);
        setPickerResults(results);
      } catch {
        setPickerResults([]);
      } finally {
        setPickerLoading(false);
      }
    }, 350);
  }, [pickerQuery]);

  // Close picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Line management ────────────────────────────────────────────────────────

  /** Called when admin picks a product from search: open modal (no filling state). */
  function openProductModal(product: PosProductResult) {
    setEditingLocalId(null); // New line, not editing existing
    setModalProductId(product.id);
    setPickerQuery("");
    setPickerResults([]);
    setPickerOpen(false);
  }

  /** Called when modal's onAdd fires (new line or edit). */
  function handleModalAdd(posLine: PosAddToOrderLine) {
    if (editingLocalId) {
      // Replace existing line
      setLines((prev) =>
        prev.map((l) =>
          l.localId === editingLocalId
            ? posAddToOrderToLineWithId(posLine, editingLocalId)
            : l,
        ),
      );
    } else {
      // Append new line
      const localId = makeLocalId();
      setLines((prev) => [...prev, posAddToOrderToLineWithId(posLine, localId)]);
    }
    setEditingLocalId(null);
  }

  function openEditModal(localId: string) {
    const line = lines.find((l) => l.localId === localId);
    if (!line || line.kind === "free_text") return;
    const productId = (line as PosLineStocked | PosLineConfigurable).productId;
    setEditingLocalId(localId);
    setModalProductId(productId);
  }

  function addFreeTextLine() {
    const localId = makeLocalId();
    const newLine: LineWithId = {
      localId,
      kind: "free_text",
      name: "",
      quantity: 1,
      unitPrice: 0,
    };
    setLines((prev) => [...prev, newLine]);
    setPickerOpen(false);
    setPickerQuery("");
  }

  function updateLine(localId: string, updated: PosLine) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.localId !== localId) return l;
        // Preserve display snapshot fields
        const ext = updated as LineWithId;
        return {
          ...updated,
          localId,
          productName: ext.productName ?? (l as LineWithId).productName,
          productImageUrl: ext.productImageUrl ?? (l as LineWithId).productImageUrl,
          variantLabel: ext.variantLabel ?? (l as LineWithId).variantLabel,
          configSummary: ext.configSummary ?? (l as LineWithId).configSummary,
        } as LineWithId;
      }),
    );
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
  }

  // ── Coupon ─────────────────────────────────────────────────────────────────

  function handleApplyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponError("Enter a coupon code first.");
      return;
    }
    setAppliedCoupon(code);
    setCouponError(null);
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }

  // ── Totals ─────────────────────────────────────────────────────────────────

  const subtotal = lines.reduce((sum, line) => {
    if (line.kind === "free_text") return sum + line.unitPrice * line.quantity;
    if (line.kind === "stocked") {
      const override = (line as PosLineStocked).unitPriceOverride;
      return sum + (override ?? 0) * line.quantity;
    }
    if (line.kind === "configurable") {
      const cl = line as PosLineConfigurable;
      const price = cl.unitPriceOverride ?? cl.computedUnitPrice;
      return sum + price * cl.quantity;
    }
    return sum;
  }, 0);

  const shippingCost = shippingOverride !== "" ? parseFloat(shippingOverride) || 0 : 0;
  const total = subtotal + shippingCost;

  // ── Create order → customer step → submit ─────────────────────────────────

  function handleCreateOrderClick() {
    if (lines.length === 0) {
      setSubmitError("Add at least one product line before creating the order.");
      return;
    }
    setSubmitError(null);
    setShowCustomerStep(true);
  }

  function handleCustomerStepConfirm() {
    // Validate required fields
    if (!customerForm.name.trim()) {
      setSubmitError("Customer name is required.");
      return;
    }
    if (!customerForm.phone.trim()) {
      setSubmitError("Customer phone is required.");
      return;
    }
    if (!customerForm.addressLine1.trim()) {
      setSubmitError("Address line 1 is required.");
      return;
    }
    if (!customerForm.city.trim()) {
      setSubmitError("City is required.");
      return;
    }
    if (!customerForm.postcode.trim()) {
      setSubmitError("Postcode is required.");
      return;
    }

    setSubmitError(null);

    startTransition(async () => {
      // Strip localId and display snapshot fields — server only needs PosLine fields
      const serverLines = lines.map(
        ({ localId: _lid, productName: _pn, productImageUrl: _pi, variantLabel: _vl, configSummary: _cs, ...rest }) => rest,
      ) as PosLine[];

      const result = await createPosOrder({
        lines: serverLines,
        customer: {
          name: customerForm.name,
          email: customerForm.email || undefined,
          phone: customerForm.phone,
          addressLine1: customerForm.addressLine1,
          addressLine2: customerForm.addressLine2 || undefined,
          city: customerForm.city,
          state: customerForm.state,
          postcode: customerForm.postcode,
          country: "Malaysia",
        },
        shippingOverride:
          shippingOverride !== "" ? parseFloat(shippingOverride) || undefined : undefined,
        couponCode: appliedCoupon || undefined,
      });

      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }

      // Clear autosave
      try {
        localStorage.removeItem(AUTOSAVE_KEY);
      } catch {
        // noop
      }

      setCreatedOrderId(result.orderId);
      setCreatedOrderNumber(result.orderNumber);
      setCreatedOrderTotal(total);
      setShowCustomerStep(false);
      setSendDraftOpen(true);
    });
  }

  // ── Restore / discard draft ────────────────────────────────────────────────

  function handleRestoreDraft() {
    if (!pendingDraft) return;
    setLines(pendingDraft.lines ?? []);
    setCustomerForm(pendingDraft.customerForm ?? customerForm);
    setCouponCode(pendingDraft.couponCode ?? "");
    setShippingOverride(pendingDraft.shippingOverride ?? "");
    setShowRestoreBanner(false);
    setPendingDraft(null);
  }

  function handleDiscardDraft() {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      // noop
    }
    setShowRestoreBanner(false);
    setPendingDraft(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const inputClass =
    "w-full min-h-[48px] rounded-[4px] border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#0080ff] transition-colors";

  return (
    <div className="max-w-6xl mx-auto">
      {/* Restore banner */}
      {showRestoreBanner ? (
        <div className="mb-4">
          <DraftRestoredBanner
            savedAt={draftSavedAt}
            onRestore={handleRestoreDraft}
            onDiscard={handleDiscardDraft}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── Left column: builder ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Product picker */}
          <section
            className="rounded-[4px] border-2 border-slate-200 bg-white p-4 space-y-3"
            aria-label="Product search"
          >
            <h2
              className="font-[var(--font-heading)] text-lg font-semibold"
              style={{ color: BRAND.ink }}
            >
              Add products
            </h2>

            {/* Combobox */}
            <div className="relative" ref={pickerRef}>
              <input
                type="text"
                placeholder="Search any product…"
                value={pickerQuery}
                onChange={(e) => {
                  setPickerQuery(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                className={inputClass}
                aria-label="Search products"
                aria-expanded={pickerOpen && (pickerResults.length > 0 || pickerLoading)}
                aria-haspopup="listbox"
              />

              {/* Dropdown */}
              {pickerOpen && (pickerQuery.trim() || pickerLoading) ? (
                <div
                  className="absolute left-0 right-0 top-full z-30 mt-1 rounded-[4px] border-2 border-slate-200 bg-white shadow-md"
                  role="listbox"
                >
                  {pickerLoading ? (
                    <div className="p-2 space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 rounded-[4px] bg-slate-100 animate-pulse" />
                      ))}
                    </div>
                  ) : pickerResults.length > 0 ? (
                    <ul>
                      {pickerResults.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onClick={() => openProductModal(product)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors min-h-[64px] cursor-pointer"
                          >
                            {/* Thumbnail */}
                            <div className="h-10 w-10 shrink-0 rounded-[4px] bg-slate-100 overflow-hidden flex items-center justify-center">
                              {product.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.thumbnailUrl}
                                  alt={product.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package size={20} className="text-slate-400" />
                              )}
                            </div>

                            {/* Name + subtitle */}
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-sm font-medium" style={{ color: BRAND.ink }}>
                                {product.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {product.productType} · {product.variantCount} variant
                                {product.variantCount !== 1 ? "s" : ""}
                              </p>
                            </div>

                            {/* Type icon */}
                            <span className="text-slate-400 shrink-0">
                              {productTypeIcon(product.productType)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-4 py-3 text-sm text-slate-500">
                      Nothing matched. Add a custom line instead.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Add custom free-text line button */}
            <button
              type="button"
              onClick={addFreeTextLine}
              className="flex w-full items-center justify-center gap-2 min-h-[48px] rounded-[4px] border-2 px-4 text-sm font-medium transition-colors hover:bg-slate-50 cursor-pointer"
              style={{ borderColor: "#8A00C2", color: BRAND.ink }}
            >
              <Pencil size={16} style={{ color: "#8A00C2" }} />
              + Add custom (free-text) line
            </button>
          </section>

          {/* Line list */}
          <section aria-label="Order lines">
            {lines.length === 0 ? (
              <div
                className="rounded-[4px] border-2 border-dashed border-slate-200 p-8 text-center"
                style={{ backgroundColor: BRAND.cream }}
              >
                <ShoppingBag size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">
                  Search a product above to pop the option picker, or add a custom line.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((line) => (
                  <PosLineRow
                    key={line.localId}
                    line={line}
                    onChange={(updated) => updateLine(line.localId, updated)}
                    onRemove={() => removeLine(line.localId)}
                    onEdit={
                      line.kind !== "free_text"
                        ? () => openEditModal(line.localId)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Coupon strip */}
          <section
            className="rounded-[4px] border-2 border-slate-200 bg-white p-4"
            aria-label="Coupon"
          >
            <h2
              className="font-[var(--font-heading)] text-base font-semibold mb-3"
              style={{ color: BRAND.ink }}
            >
              Coupon
            </h2>
            {appliedCoupon ? (
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-sm font-semibold"
                  style={{ backgroundColor: "#0080ff1a", color: "#0080ff" }}
                >
                  <CheckCircle2 size={14} />
                  {appliedCoupon}
                </span>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 min-h-[40px] px-2 transition-colors cursor-pointer"
                  aria-label="Remove coupon"
                >
                  <X size={14} />
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="COUPON CODE"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    setCouponError(null);
                  }}
                  className="w-40 min-h-[48px] rounded-[4px] border-2 border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0080ff] transition-colors"
                  aria-label="Coupon code"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="min-h-[48px] rounded-[4px] px-4 text-sm font-semibold text-white transition-colors cursor-pointer"
                  style={{ backgroundColor: "#8A00C2" }}
                  onMouseEnter={(e) =>
                    ((e.target as HTMLButtonElement).style.backgroundColor = "#62008C")
                  }
                  onMouseLeave={(e) =>
                    ((e.target as HTMLButtonElement).style.backgroundColor = "#8A00C2")
                  }
                >
                  Apply
                </button>
              </div>
            )}
            {couponError ? (
              <p className="mt-1.5 text-xs text-red-600" role="alert">
                {couponError}
              </p>
            ) : null}
          </section>

          {/* Submit error */}
          {submitError ? (
            <div
              className="rounded-[4px] border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {submitError}
            </div>
          ) : null}

          {/* Mobile sticky bottom button */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-10 bg-white border-t-2 border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={handleCreateOrderClick}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 min-h-[60px] rounded-[4px] text-base font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: "#03C03C" }}
            >
              {pending ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Working…
                </>
              ) : (
                "Create order"
              )}
            </button>
          </div>
        </div>

        {/* ── Right column: summary (sticky on desktop) ── */}
        <div className="w-full lg:w-80 shrink-0">
          <div
            className="sticky top-8 rounded-[4px] border-2 border-slate-200 bg-white p-6 space-y-4"
            aria-label="Order totals"
          >
            <h2
              className="font-[var(--font-heading)] text-lg font-semibold"
              style={{ color: BRAND.ink }}
            >
              Summary
            </h2>

            {/* Line count badge */}
            {lines.length > 0 ? (
              <p className="text-xs text-slate-500">
                {lines.length} line{lines.length !== 1 ? "s" : ""}
              </p>
            ) : null}

            {/* Subtotal */}
            <div className="flex justify-between text-sm tabular-nums">
              <span className="text-slate-600">Subtotal</span>
              <span>{formatMYR(subtotal)}</span>
            </div>

            {/* Shipping */}
            <div className="flex items-center justify-between text-sm tabular-nums">
              <span className="text-slate-600">Shipping</span>
              <div className="flex items-center gap-2">
                {editingShipping ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shippingOverride}
                    onChange={(e) => setShippingOverride(e.target.value)}
                    onBlur={() => setEditingShipping(false)}
                    autoFocus
                    className="w-24 rounded-[4px] border border-slate-300 px-2 py-1 text-sm text-right font-mono focus:outline-none focus:border-[#0080ff]"
                    placeholder="0.00"
                    aria-label="Override shipping cost"
                  />
                ) : (
                  <>
                    <span>{formatMYR(shippingCost)}</span>
                    <button
                      type="button"
                      onClick={() => setEditingShipping(true)}
                      className="text-slate-400 hover:text-slate-600 min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors cursor-pointer"
                      aria-label="Edit shipping cost"
                    >
                      <Pencil size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Coupon */}
            {appliedCoupon ? (
              <div className="flex justify-between text-sm text-green-700 tabular-nums">
                <span>Coupon ({appliedCoupon})</span>
                <span>Applied at submit</span>
              </div>
            ) : null}

            {/* Total */}
            <div
              className="flex justify-between border-t-2 border-slate-200 pt-4 text-base font-bold tabular-nums"
            >
              <span>Total</span>
              <span>{formatMYR(total)}</span>
            </div>

            {/* Create order button (desktop) */}
            <button
              type="button"
              onClick={handleCreateOrderClick}
              disabled={pending}
              className="hidden lg:flex w-full items-center justify-center gap-2 min-h-[60px] rounded-[4px] text-base font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: "#03C03C" }}
              onMouseEnter={(e) => {
                if (!pending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#018A29";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#03C03C";
              }}
            >
              {pending ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Working…
                </>
              ) : (
                "Create order"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Product quick-add modal ── */}
      {modalProductId ? (
        <PosProductModal
          productId={modalProductId}
          open={!!modalProductId}
          onClose={() => {
            setModalProductId(null);
            setEditingLocalId(null);
          }}
          onAdd={handleModalAdd}
        />
      ) : null}

      {/* ── Customer step modal ── */}
      {showCustomerStep ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(11,16,32,0.55)" }}
          onClick={() => setShowCustomerStep(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Customer details"
        >
          <div
            className="relative flex flex-col bg-white rounded-xl overflow-hidden"
            style={{
              maxWidth: 600,
              width: "92vw",
              maxHeight: "90vh",
              boxShadow: "0 24px 64px rgba(0,0,0,0.32)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b-2 border-slate-200 bg-white shrink-0">
              <span
                className="flex-1 font-semibold text-base"
                style={{ color: BRAND.ink }}
              >
                Customer details
              </span>
              <button
                type="button"
                onClick={() => setShowCustomerStep(false)}
                className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                aria-label="Close customer details"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-5">
              <PosCustomerStep
                customerForm={customerForm}
                onChange={setCustomerForm}
              />

              {/* Submit error inside modal */}
              {submitError ? (
                <div
                  className="mt-4 rounded-[4px] border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {submitError}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 shrink-0 flex gap-3 px-5 py-4 border-t-2 border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setShowCustomerStep(false)}
                className="flex-1 min-h-[52px] rounded-[4px] border-2 text-sm font-semibold transition-colors cursor-pointer"
                style={{ borderColor: "#cbd5e1", color: BRAND.ink }}
                disabled={pending}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCustomerStepConfirm}
                disabled={pending}
                className="flex-1 flex items-center justify-center gap-2 min-h-[52px] rounded-[4px] text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
                style={{ backgroundColor: "#03C03C" }}
                onMouseEnter={(e) => {
                  if (!pending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#018A29";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#03C03C";
                }}
              >
                {pending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Confirm & create order"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Send-draft modal ── */}
      {sendDraftOpen && createdOrderId && createdOrderNumber ? (
        <PosSendDraftModal
          open={sendDraftOpen}
          onClose={() => setSendDraftOpen(false)}
          orderId={createdOrderId}
          orderNumber={createdOrderNumber}
          orderTotal={createdOrderTotal}
          customerName={customerForm.name}
          customerPhone={customerForm.phone}
        />
      ) : null}
    </div>
  );
}
