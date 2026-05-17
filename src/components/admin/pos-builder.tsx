"use client";

/**
 * Phase 20 (20-09) — Admin POS Builder.
 *
 * Multi-line order form with:
 *   - Global product type-ahead combobox
 *   - Per-line PosLineRow (collapsed + expanded for configurables)
 *   - Customer details + shipping form (MALAYSIAN_STATES)
 *   - Coupon strip with Apply / Remove
 *   - Totals card (sticky right on desktop)
 *   - 1s debounced admin autosave at "admin-pos-draft" namespace
 *   - Post-submit PosSendDraftModal
 *
 * Reactivity contract (Phase 17 AD-06):
 *   Pattern A optimistic — quantity stepper, unit-price override.
 *   Pattern B refetch — line add / remove / configurator shape change.
 *   NEVER router.refresh() in any mutation path.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Package,
  Settings2,
  Keyboard,
  Pencil,
  ShoppingBag,
  Phone,
  Loader2,
  X,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { MALAYSIAN_STATES } from "@/lib/validators";
import {
  createPosOrder,
  getPosProductSearch,
  type PosLine,
  type PosLineStocked,
  type PosLineConfigurable,
  type PosLineFreeText,
  type PosProductResult,
} from "@/actions/admin-pos";
import { DraftRestoredBanner } from "@/components/admin/draft-restored-banner";
import { PosLineRow } from "@/components/admin/pos-line-row";
import { PosSendDraftModal } from "@/components/admin/pos-send-draft-modal";

// ─── Local types ──────────────────────────────────────────────────────────────

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: (typeof MALAYSIAN_STATES)[number];
  postcode: string;
};

/** Internal representation with a stable local ID for React keys. */
type LineWithId = { localId: string } & PosLine;

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

// ─── Component ────────────────────────────────────────────────────────────────

export function PosBuilder() {
  // ── State ─────────────────────────────────────────────────────────────────

  const [lines, setLines] = useState<LineWithId[]>([]);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

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

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [shippingOverride, setShippingOverride] = useState<string>("");
  const [editingShipping, setEditingShipping] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Restore banner
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number>(0);
  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);

  // Send-draft modal
  const [sendDraftOpen, setSendDraftOpen] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);
  const [createdOrderTotal, setCreatedOrderTotal] = useState<number>(0);

  // Product picker
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
      // Ignore parse errors — corrupt draft is silently discarded
    }
  }, []);

  // ── Autosave: debounced write on state change ──────────────────────────────

  useEffect(() => {
    if (pickerLoading) return; // Don't autosave during picker fetch
    if (pickerDebounce.current) clearTimeout(pickerDebounce.current);
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

  function addProductLine(product: PosProductResult) {
    const localId = makeLocalId();
    const isConfigurable =
      product.productType === "configurable" || product.productType === "keychain";

    if (isConfigurable) {
      const newLine: LineWithId = {
        localId,
        kind: "configurable",
        productId: product.id,
        quantity: 1,
        configurationData: "{}",
        computedUnitPrice: 0,
      };
      setLines((prev) => [...prev, newLine]);
      // Auto-expand new configurable line so admin can fill fields
      setExpandedLineId(localId);
    } else {
      // Stocked — add a placeholder; the row will show variant selector
      const newLine: LineWithId = {
        localId,
        kind: "stocked",
        productId: product.id,
        variantId: "",
        quantity: 1,
      };
      setLines((prev) => [...prev, newLine]);
    }

    setPickerQuery("");
    setPickerResults([]);
    setPickerOpen(false);
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
      prev.map((l) => (l.localId === localId ? { ...updated, localId } : l))
    );
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
    if (expandedLineId === localId) setExpandedLineId(null);
  }

  // ── Coupon ─────────────────────────────────────────────────────────────────

  function handleApplyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponError("Enter a coupon code first.");
      return;
    }
    // Validation happens server-side at submit; here we just set the code
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

  // ── Customer form ──────────────────────────────────────────────────────────

  function setCustomer<K extends keyof CustomerForm>(k: K, v: CustomerForm[K]) {
    setCustomerForm((prev) => ({ ...prev, [k]: v }));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (lines.length === 0) {
      setSubmitError("Add at least one product line before creating the order.");
      return;
    }

    startTransition(async () => {
      // Strip localId from lines before sending to server
      const serverLines = lines.map(({ localId: _localId, ...rest }) => rest) as PosLine[];

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
        shippingOverride: shippingOverride !== "" ? parseFloat(shippingOverride) || undefined : undefined,
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
    <div>
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

      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* ── Left column: builder ── */}
          <div className="flex-1 min-w-0 space-y-6">

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
                  placeholder="Search any product, or add a custom line…"
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
                      /* Skeleton */
                      <div className="p-2 space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="h-16 rounded-[4px] bg-slate-100 animate-pulse"
                          />
                        ))}
                      </div>
                    ) : pickerResults.length > 0 ? (
                      <ul>
                        {pickerResults.map((product) => (
                          <li key={product.id}>
                            <button
                              type="button"
                              onClick={() => addProductLine(product)}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors min-h-[64px]"
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
                className="flex w-full items-center justify-center gap-2 min-h-[48px] rounded-[4px] border-2 px-4 text-sm font-medium transition-colors hover:bg-slate-50"
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
                    No items yet. Search a product above or add a custom line.
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
                      isExpanded={expandedLineId === line.localId}
                      onToggleExpand={() =>
                        setExpandedLineId((prev) =>
                          prev === line.localId ? null : line.localId
                        )
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
                    {appliedCoupon}
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 min-h-[40px] px-2"
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
                    className="min-h-[48px] rounded-[4px] px-4 text-sm font-semibold text-white transition-colors"
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

            {/* Customer + shipping form */}
            <section
              className="rounded-[4px] border-2 border-slate-200 bg-white p-4 space-y-4"
              aria-label="Customer and shipping details"
            >
              <h2
                className="font-[var(--font-heading)] text-lg font-semibold"
                style={{ color: BRAND.ink }}
              >
                Customer details
              </h2>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Full name <span className="text-red-600">*</span>
                  </label>
                  <input
                    className={inputClass}
                    required
                    value={customerForm.name}
                    onChange={(e) => setCustomer("name", e.target.value)}
                    placeholder="Ali Hassan"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Phone <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <input
                      className={inputClass + " pl-9"}
                      required
                      value={customerForm.phone}
                      onChange={(e) => setCustomer("phone", e.target.value)}
                      placeholder="601XXXXXXXX"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    className={inputClass}
                    value={customerForm.email}
                    onChange={(e) => setCustomer("email", e.target.value)}
                    placeholder="customer@example.com"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Without email, you send the payment link via WhatsApp manually.
                  </p>
                </div>

                {/* Address line 1 */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Address line 1 <span className="text-red-600">*</span>
                  </label>
                  <input
                    className={inputClass}
                    required
                    value={customerForm.addressLine1}
                    onChange={(e) => setCustomer("addressLine1", e.target.value)}
                  />
                </div>

                {/* Address line 2 */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Address line 2
                  </label>
                  <input
                    className={inputClass}
                    value={customerForm.addressLine2}
                    onChange={(e) => setCustomer("addressLine2", e.target.value)}
                  />
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    City <span className="text-red-600">*</span>
                  </label>
                  <input
                    className={inputClass}
                    required
                    value={customerForm.city}
                    onChange={(e) => setCustomer("city", e.target.value)}
                  />
                </div>

                {/* State */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    State <span className="text-red-600">*</span>
                  </label>
                  <select
                    className={inputClass}
                    required
                    value={customerForm.state}
                    onChange={(e) =>
                      setCustomer("state", e.target.value as (typeof MALAYSIAN_STATES)[number])
                    }
                  >
                    {MALAYSIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Postcode */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Postcode <span className="text-red-600">*</span>
                  </label>
                  <input
                    className={inputClass + " font-mono"}
                    required
                    maxLength={5}
                    pattern="\d{5}"
                    value={customerForm.postcode}
                    onChange={(e) => setCustomer("postcode", e.target.value)}
                    placeholder="50000"
                  />
                </div>
              </div>
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
                type="submit"
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 min-h-[60px] rounded-[4px] text-base font-semibold text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: "#03C03C" }}
              >
                {pending ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Working…
                  </>
                ) : (
                  "Save & continue"
                )}
              </button>
            </div>
          </div>

          {/* ── Right column: totals card (sticky on desktop) ── */}
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

              {/* Subtotal */}
              <div className="flex justify-between text-sm" style={{ fontFeatureSettings: "'tnum'" }}>
                <span className="text-slate-600">Subtotal</span>
                <span>{formatMYR(subtotal)}</span>
              </div>

              {/* Shipping */}
              <div className="flex items-center justify-between text-sm" style={{ fontFeatureSettings: "'tnum'" }}>
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
                        className="text-slate-400 hover:text-slate-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
                        aria-label="Edit shipping cost"
                      >
                        <Pencil size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Discount (if coupon applied) */}
              {appliedCoupon ? (
                <div className="flex justify-between text-sm text-green-700" style={{ fontFeatureSettings: "'tnum'" }}>
                  <span>Coupon ({appliedCoupon})</span>
                  <span>Applied at submit</span>
                </div>
              ) : null}

              {/* Total */}
              <div
                className="flex justify-between border-t-2 border-slate-200 pt-4 text-base font-bold"
                style={{ fontFeatureSettings: "'tnum'" }}
              >
                <span>Total</span>
                <span>{formatMYR(total)}</span>
              </div>

              {/* Create order button (desktop only) */}
              <button
                type="submit"
                disabled={pending}
                className="hidden lg:flex w-full items-center justify-center gap-2 min-h-[60px] rounded-[4px] text-base font-semibold text-white transition-colors disabled:opacity-60"
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
      </form>

      {/* Send-draft modal */}
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
