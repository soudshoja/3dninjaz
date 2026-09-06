"use client";

/**
 * Phase 20 (20-09b / Demo-B rework) — Admin POS Builder.
 *
 * Layout matches the approved Demo B mockup (public/demo/pos-b-quickadd.html):
 *   LEFT pane  — search box + product tile grid (thumbnail, name, price, badge).
 *                Tapping a tile with no options adds directly to ticket.
 *                Tapping a tile with variants/config opens PosProductModal.
 *   RIGHT pane — compact order ticket (small thumb, name, subtitle, qty×price,
 *                line total, remove) + Summary block (subtotal / shipping /
 *                total) + green Create-order button.
 *
 * Flow unchanged from 20-09:
 *   tile tap → modal (if needed) → ticket line → Create order →
 *   PosCustomerStep → createPosOrder → PosSendDraftModal
 *
 * Autosave: "admin-pos-draft" localStorage 1s debounce. DraftRestoredBanner.
 * Reactivity contract AD-06: NEVER router.refresh().
 */

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Package,
  Search,
  Loader2,
  X,
  Pencil,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  createPosOrder,
  getPosProductSearch,
  getPosRecentProducts,
  type PosLine,
  type PosLineStocked,
  type PosLineConfigurable,
  type PosProductResult,
} from "@/actions/admin-pos";
import { DraftRestoredBanner } from "@/components/admin/draft-restored-banner";
import { PosSendDraftModal } from "@/components/admin/pos-send-draft-modal";
import { PosProductModal } from "@/components/admin/pos-product-modal";
import { PosCustomerStep, type CustomerForm, type PosCustomerStepHandle } from "@/components/admin/pos-customer-step";
import type { PosAddToOrderLine } from "@/components/store/product-detail";
import type { CartItemForQuote } from "@/lib/shipping-quote-types";
import { ensureConfigurationData } from "@/lib/config-fields";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Ticket line — PosLine + stable React key + display snapshot fields. */
export type TicketLine = {
  localId: string;
  productName?: string;
  productImageUrl?: string | null;
  variantLabel?: string | null;
  configSummary?: string | null;
} & PosLine;

// ─── Autosave ─────────────────────────────────────────────────────────────────

const AUTOSAVE_KEY = "admin-pos-draft";
const AUTOSAVE_DEBOUNCE_MS = 1000;

type DraftPayload = {
  savedAt: number;
  lines: TicketLine[];
  customerForm: CustomerForm;
  shippingOverride: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLocalId() {
  return Math.random().toString(36).slice(2);
}

function fmtMYR(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function getLineUnitPrice(line: PosLine): number {
  if (line.kind === "free_text") return line.unitPrice;
  if (line.kind === "stocked") return (line as PosLineStocked).unitPriceOverride ?? 0;
  if (line.kind === "configurable") {
    const cl = line as PosLineConfigurable;
    return cl.unitPriceOverride ?? cl.computedUnitPrice;
  }
  return 0;
}

/** Does this product need the quick-add modal (has options / config)? */
function needsModal(product: PosProductResult): boolean {
  return (
    product.variantCount > 0 ||
    product.productType === "configurable" ||
    product.productType === "keychain"
  );
}

/** Map PosAddToOrderLine → TicketLine. */
function toTicketLine(posLine: PosAddToOrderLine, localId: string): TicketLine {
  const configSummary = posLine.configurationData?.computedSummary ?? null;
  if (posLine.variantId) {
    return {
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
    } as TicketLine;
  }
  return {
    localId,
    kind: "configurable",
    productId: posLine.productId,
    quantity: posLine.qty,
    computedUnitPrice: posLine.unitPrice,
    // Stringify the FULL ConfigurationData ({ values, computedPrice,
    // computedSummary }) — not just .values. Downstream consumers
    // (ensureConfigurationData via Zod) reject a bare values map, which
    // would silently zero out Tier 0 per-option shipping weight and break
    // order_items.configuration_data parsing on the invoice + admin views.
    configurationData: posLine.configurationData
      ? JSON.stringify(posLine.configurationData)
      : "{}",
    productName: posLine.productName,
    productImageUrl: posLine.productImageUrl ?? null,
    variantLabel: posLine.variantLabel ?? null,
    configSummary,
  } as TicketLine;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Product tile — thumbnail + name + price + OPTIONS/CONFIG badge. */
function ProductTile({
  product,
  onClick,
}: {
  product: PosProductResult;
  onClick: () => void;
}) {
  const hasOptions = needsModal(product);
  const badge =
    product.productType === "configurable" || product.productType === "keychain"
      ? "CONFIG"
      : hasOptions
        ? "OPTIONS"
        : null;

  const priceLabel =
    product.minPrice !== null
      ? fmtMYR(product.minPrice)
      : product.productType === "keychain"
        ? "Tiered"
        : product.productType === "configurable"
          ? "Tiered"
          : "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative bg-white border-2 border-slate-200 rounded-lg overflow-hidden cursor-pointer text-left transition-all duration-150 hover:-translate-y-0.5"
      style={{ minHeight: 0 }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#8A00C2";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 16px rgba(138,0,194,.12)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
      }}
    >
      {/* Badge */}
      {badge && (
        <span
          className="absolute top-2 right-2 text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-[3px] z-10"
          style={{ backgroundColor: "#8A00C2" }}
        >
          {badge}
        </span>
      )}

      {/* Thumbnail */}
      <div
        className="aspect-square w-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden"
      >
        {product.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.thumbnailUrl}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <Package size={32} className="text-slate-400" />
        )}
      </div>

      {/* Meta */}
      <div className="p-2.5">
        <p
          className="text-[13px] font-semibold leading-snug line-clamp-2"
          style={{ color: BRAND.ink }}
        >
          {product.name}
        </p>
        <p
          className="text-[14px] font-extrabold mt-1 tabular-nums"
          style={{ color: BRAND.ink }}
        >
          {priceLabel}
        </p>
      </div>
    </button>
  );
}

/** Compact ticket line row. */
function TicketLineRow({
  line,
  onRemove,
}: {
  line: TicketLine;
  onRemove: () => void;
}) {
  const unitPrice = getLineUnitPrice(line);
  const lineTotal = unitPrice * line.quantity;
  const subtitle = [line.variantLabel, line.configSummary].filter(Boolean).join(" · ");
  const thumbUrl = line.productImageUrl ?? null;

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-100"
    >
      {/* Thumb */}
      <div
        className="h-9 w-9 shrink-0 rounded-[5px] bg-slate-100 flex items-center justify-center overflow-hidden"
      >
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Package size={16} className="text-slate-400" />
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight truncate" style={{ color: BRAND.ink }}>
          {line.kind === "free_text"
            ? line.name || "(custom line)"
            : line.productName ?? "Product"}
        </p>
        {subtitle ? (
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{subtitle}</p>
        ) : null}
        <p className="text-[12px] font-semibold tabular-nums mt-0.5" style={{ color: BRAND.ink }}>
          {line.quantity} × {fmtMYR(unitPrice)}
        </p>
      </div>

      {/* Line total */}
      <p className="text-[13px] font-extrabold tabular-nums shrink-0 font-mono" style={{ color: BRAND.ink }}>
        {fmtMYR(lineTotal)}
      </p>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 transition-colors shrink-0 cursor-pointer"
        aria-label={`Remove ${line.kind === "free_text" ? line.name || "item" : line.productName ?? "item"}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── PosBuilder ───────────────────────────────────────────────────────────────

export function PosBuilder() {
  // ── Lines ──────────────────────────────────────────────────────────────────
  const [lines, setLines] = useState<TicketLine[]>([]);

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

  // ── Shipping override ──────────────────────────────────────────────────────
  const [shippingOverride, setShippingOverride] = useState<string>("");
  const [editingShipping, setEditingShipping] = useState(false);
  const [shippingCourier, setShippingCourier] = useState<{ serviceCode: string; serviceName: string } | null>(null);

  // ── Product grid / search ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [gridProducts, setGridProducts] = useState<PosProductResult[]>([]);
  const [gridLoading, setGridLoading] = useState(true);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Product modal ──────────────────────────────────────────────────────────
  const [modalProductId, setModalProductId] = useState<string | null>(null);
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);

  // ── Customer step modal ────────────────────────────────────────────────────
  const [showCustomerStep, setShowCustomerStep] = useState(false);

  // ── No-email confirmation dialog ───────────────────────────────────────────
  const [confirmNoEmailOpen, setConfirmNoEmailOpen] = useState(false);

  // ── Customer step ref (for focus-email from dialog) ────────────────────────
  const customerStepRef = useRef<PosCustomerStepHandle>(null);

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

  // ── Load initial grid ──────────────────────────────────────────────────────
  useEffect(() => {
    setGridLoading(true);
    getPosRecentProducts()
      .then((rows) => setGridProducts(rows))
      .catch(() => setGridProducts([]))
      .finally(() => setGridLoading(false));
  }, []);

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!searchQuery.trim()) {
      // Restore the full recent-products grid when search is cleared
      setGridLoading(true);
      getPosRecentProducts()
        .then((rows) => setGridProducts(rows))
        .catch(() => setGridProducts([]))
        .finally(() => setGridLoading(false));
      return;
    }
    setGridLoading(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const results = await getPosProductSearch(searchQuery);
        setGridProducts(results);
      } catch {
        setGridProducts([]);
      } finally {
        setGridLoading(false);
      }
    }, 350);
  }, [searchQuery]);

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
        localStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({
            savedAt: Date.now(),
            lines,
            customerForm,
            shippingOverride,
          } satisfies DraftPayload),
        );
      } catch {
        // quota exceeded — silently skip
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, customerForm, shippingOverride]);

  // ── Line management ────────────────────────────────────────────────────────

  function handleTileTap(product: PosProductResult) {
    if (needsModal(product)) {
      setEditingLocalId(null);
      setModalProductId(product.id);
    } else {
      // Simple product — add directly with price from minPrice (may be null if no variants)
      // We open the modal to let ProductDetail handle the actual add so price is correct.
      setEditingLocalId(null);
      setModalProductId(product.id);
    }
  }

  function handleModalAdd(posLine: PosAddToOrderLine) {
    if (editingLocalId) {
      setLines((prev) =>
        prev.map((l) =>
          l.localId === editingLocalId ? toTicketLine(posLine, editingLocalId) : l,
        ),
      );
    } else {
      const localId = makeLocalId();
      setLines((prev) => [...prev, toTicketLine(posLine, localId)]);
    }
    setEditingLocalId(null);
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
  }

  // ── Totals ─────────────────────────────────────────────────────────────────

  const subtotal = lines.reduce((sum, line) => {
    return sum + getLineUnitPrice(line) * line.quantity;
  }, 0);

  const shippingCost = shippingOverride !== "" ? parseFloat(shippingOverride) || 0 : 0;
  const total = subtotal + shippingCost;

  // ── Cart items for shipping quote ──────────────────────────────────────────
  // Map ticket lines → CartItemForQuote[]. Free-text lines (productId undefined)
  // and configurable lines without a variantId get variantId="manual" — the
  // weight fallback in quoteForCart handles missing variant rows gracefully.
  //
  // CRITICAL — POS configurable shape differs from checkout:
  //   PosLineConfigurable.configurationData (admin-pos.ts ~line 76) is typed
  //   `string` (a JSON STRING serialised via JSON.stringify in toTicketLine).
  //   Accessing .values directly on the raw string returns undefined.
  //   We must parse via ensureConfigurationData() before reading .values.
  //   Contrast: checkout HydratedCartItem.configurationData is a real OBJECT.
  const quoteItems: CartItemForQuote[] = lines
    .filter((l) => l.kind !== "free_text")
    .map((l) => ({
      productId: (l as { productId?: string }).productId ?? "manual",
      variantId:
        l.kind === "stocked"
          ? ((l as { variantId?: string }).variantId ?? "manual")
          : "manual",
      quantity: l.quantity,
      unitPrice: getLineUnitPrice(l),
      // Configurable POS lines carry configurationData as a JSON STRING — parse first.
      // Yields undefined on parse failure, causing graceful fallthrough to default weight.
      configValues:
        l.kind === "configurable"
          ? ensureConfigurationData((l as PosLineConfigurable).configurationData)?.values
          : undefined,
    }));

  function handleShippingFromCustomerStep(
    price: number,
    courier: { serviceCode: string; serviceName: string } | null,
  ) {
    setShippingOverride(price === 0 ? "0" : price.toFixed(2));
    setShippingCourier(courier);
  }

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
    if (!customerForm.name.trim()) { setSubmitError("Customer name is required."); return; }
    if (!customerForm.phone.trim()) { setSubmitError("Customer phone is required."); return; }
    if (!customerForm.addressLine1.trim()) { setSubmitError("Address line 1 is required."); return; }
    if (!customerForm.city.trim()) { setSubmitError("City is required."); return; }
    if (!customerForm.postcode.trim()) { setSubmitError("Postcode is required."); return; }
    // Gate: if email is blank, show the no-email confirmation dialog first.
    if (!customerForm.email.trim()) {
      setConfirmNoEmailOpen(true);
      return;
    }
    setSubmitError(null);
    doCreateOrder();
  }

  function doCreateOrder() {
    setSubmitError(null);

    startTransition(async () => {
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
        shippingCourier: shippingCourier ?? null,
      });

      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }

      try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* noop */ }
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
    setShippingOverride(pendingDraft.shippingOverride ?? "");
    setShowRestoreBanner(false);
    setPendingDraft(null);
  }

  function handleDiscardDraft() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* noop */ }
    setShowRestoreBanner(false);
    setPendingDraft(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto">
      {/* Restore banner */}
      {showRestoreBanner && (
        <div className="mb-4">
          <DraftRestoredBanner
            savedAt={draftSavedAt}
            onRestore={handleRestoreDraft}
            onDiscard={handleDiscardDraft}
          />
        </div>
      )}

      {/* Two-column layout: product browser | order ticket */}
      <div
        className="grid gap-0 border-2 border-slate-200 rounded-xl overflow-hidden bg-white"
        style={{ gridTemplateColumns: "1fr 380px", minHeight: "calc(100vh - 200px)" }}
      >
        {/* ── LEFT: Product browser ─────────────────────────────────────── */}
        <div
          className="flex flex-col border-r-2 border-slate-200"
          style={{ backgroundColor: BRAND.cream }}
        >
          {/* Search bar */}
          <div className="p-4 bg-white border-b-2 border-slate-200">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="search"
                placeholder="Search products…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[48px] rounded-[4px] border-2 border-slate-300 bg-white pl-10 pr-4 text-[15px] focus:outline-none focus:border-[#0080ff] transition-colors duration-150"
                aria-label="Search products"
              />
            </div>
          </div>

          {/* Product tile grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {gridLoading ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="rounded-lg overflow-hidden border-2 border-slate-200 bg-white animate-pulse">
                    <div className="aspect-square bg-slate-100" />
                    <div className="p-2.5 space-y-1.5">
                      <div className="h-3 bg-slate-200 rounded w-4/5" />
                      <div className="h-3 bg-slate-200 rounded w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : gridProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                <Package size={32} className="mb-2" />
                <p className="text-sm">
                  {searchQuery.trim() ? "No products matched." : "No active products found."}
                </p>
              </div>
            ) : (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
              >
                {gridProducts.map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    onClick={() => handleTileTap(product)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add custom free-text line */}
          <div className="p-4 bg-white border-t-2 border-slate-200">
            <button
              type="button"
              onClick={() => {
                const localId = makeLocalId();
                setLines((prev) => [
                  ...prev,
                  { localId, kind: "free_text", name: "", quantity: 1, unitPrice: 0 },
                ]);
              }}
              className="flex w-full items-center justify-center gap-2 min-h-[44px] rounded-[4px] border-2 px-4 text-sm font-medium transition-colors hover:bg-slate-50 cursor-pointer"
              style={{ borderColor: "#8A00C2", color: BRAND.ink }}
            >
              <Pencil size={14} style={{ color: "#8A00C2" }} />
              Add custom (free-text) line
            </button>
          </div>
        </div>

        {/* ── RIGHT: Order ticket ───────────────────────────────────────── */}
        <div className="flex flex-col bg-white">
          {/* Ticket header */}
          <div className="px-4 pt-4 pb-3 border-b-2 border-slate-100">
            <h2
              className="text-[15px] font-extrabold"
              style={{ color: BRAND.ink }}
            >
              Order ticket
              {lines.length > 0 && (
                <span className="ml-2 text-xs font-semibold text-slate-400">
                  ({lines.length} item{lines.length !== 1 ? "s" : ""})
                </span>
              )}
            </h2>
          </div>

          {/* Lines */}
          <div className="flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 px-5 text-center text-slate-400">
                <p className="text-sm">
                  Tap a product tile. Items with options pop a quick picker.
                </p>
              </div>
            ) : (
              <div>
                {lines.map((line) => {
                  if (line.kind === "free_text") {
                    // Inline free-text editor row
                    return (
                      <div
                        key={line.localId}
                        className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100"
                      >
                        <Pencil size={14} className="text-slate-400 shrink-0" />
                        <input
                          type="text"
                          placeholder="Item name"
                          value={line.name}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.localId === line.localId
                                  ? { ...l, name: e.target.value }
                                  : l,
                              ),
                            )
                          }
                          className="flex-1 min-w-0 text-[13px] border-0 bg-transparent p-0 focus:outline-none font-medium"
                          style={{ color: BRAND.ink }}
                          aria-label="Custom item name"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice.toFixed(2)}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.localId === line.localId
                                  ? { ...l, unitPrice: parseFloat(e.target.value) || 0 }
                                  : l,
                              ),
                            )
                          }
                          className="w-20 rounded-[4px] border border-slate-200 px-2 py-1 text-xs text-right font-mono focus:outline-none focus:border-[#0080ff]"
                          aria-label="Unit price"
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(line.localId)}
                          className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 transition-colors shrink-0 cursor-pointer"
                          aria-label="Remove custom line"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  }
                  return (
                    <TicketLineRow
                      key={line.localId}
                      line={line}
                      onRemove={() => removeLine(line.localId)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary block */}
          <div className="border-t-2 border-slate-100 px-4 pt-3 pb-2 space-y-2">
            {/* Subtotal */}
            <div className="flex justify-between text-[14px] text-slate-500 tabular-nums">
              <span>Subtotal</span>
              <span>{fmtMYR(subtotal)}</span>
            </div>

            {/* Shipping (editable) */}
            <div className="flex items-center justify-between text-[14px] text-slate-500 tabular-nums">
              <span>Shipping</span>
              <div className="flex items-center gap-1.5">
                {editingShipping ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shippingOverride}
                    onChange={(e) => setShippingOverride(e.target.value)}
                    onBlur={() => setEditingShipping(false)}
                    autoFocus
                    className="w-20 rounded-[4px] border border-slate-300 px-2 py-1 text-sm text-right font-mono focus:outline-none focus:border-[#0080ff]"
                    placeholder="0.00"
                    aria-label="Override shipping cost"
                  />
                ) : (
                  <>
                    <span>{fmtMYR(shippingCost)}</span>
                    <button
                      type="button"
                      onClick={() => setEditingShipping(true)}
                      className="flex items-center justify-center w-7 h-7 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      aria-label="Edit shipping cost"
                    >
                      <Pencil size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Total */}
            <div
              className="flex justify-between pt-2.5 border-t-2 border-slate-100 text-[18px] font-extrabold tabular-nums"
              style={{ color: BRAND.ink }}
            >
              <span>Total</span>
              <span>{fmtMYR(total)}</span>
            </div>
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="mx-4 mb-2 rounded-[4px] border-2 border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              {submitError}
            </div>
          )}

          {/* Create order button */}
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={handleCreateOrderClick}
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 rounded-[6px] text-[16px] font-extrabold text-white transition-colors duration-150 disabled:opacity-60 cursor-pointer"
              style={{ minHeight: 54, backgroundColor: "#03C03C" }}
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
            <p className="text-center text-[11px] text-slate-400 mt-2">
              Clean ticket · options chosen in a focused modal
            </p>
          </div>
        </div>
      </div>

      {/* ── Product quick-add modal ── */}
      {modalProductId && (
        <PosProductModal
          productId={modalProductId}
          open={!!modalProductId}
          onClose={() => {
            setModalProductId(null);
            setEditingLocalId(null);
          }}
          onAdd={handleModalAdd}
        />
      )}

      {/* ── Customer step modal ── */}
      {showCustomerStep && (
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
              <span className="flex-1 font-semibold text-base" style={{ color: BRAND.ink }}>
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
            {/* min-h-0 — Safari refuses to shrink a flex-1 scroll child without
                it, pushing the footer (Confirm & create order) past the
                modal's overflow-hidden edge. Chrome was unaffected. */}
            <div className="overflow-y-auto flex-1 min-h-0 px-5 py-5">
              <PosCustomerStep
                ref={customerStepRef}
                customerForm={customerForm}
                onChange={setCustomerForm}
                items={quoteItems}
                onShippingChange={handleShippingFromCustomerStep}
              />
              {submitError && (
                <div
                  className="mt-4 rounded-[4px] border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {submitError}
                </div>
              )}
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
      )}

      {/* ── Send-draft modal ── */}
      {sendDraftOpen && createdOrderId && createdOrderNumber && (
        <PosSendDraftModal
          open={sendDraftOpen}
          onClose={() => setSendDraftOpen(false)}
          orderId={createdOrderId}
          orderNumber={createdOrderNumber}
          orderTotal={createdOrderTotal}
          customerName={customerForm.name}
          customerPhone={customerForm.phone}
        />
      )}

      {/* ── No-email confirmation dialog ── */}
      {confirmNoEmailOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(11,16,32,0.65)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="no-email-dialog-title"
        >
          <div
            className="relative bg-white rounded-xl overflow-hidden"
            style={{
              maxWidth: 460,
              width: "92vw",
              boxShadow: "0 24px 64px rgba(0,0,0,0.32)",
            }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b-2 border-slate-100">
              <h2
                id="no-email-dialog-title"
                className="text-base font-extrabold"
                style={{ color: BRAND.ink }}
              >
                Send without an email?
              </h2>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 leading-relaxed">
                This customer won&apos;t receive any order emails (confirmation, processing,
                shipped, delivered). You&apos;ll need to update them manually via WhatsApp.
                Add an email now to keep them in the loop.
              </p>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-2 px-6 pb-6">
              <button
                type="button"
                onClick={() => {
                  setConfirmNoEmailOpen(false);
                  customerStepRef.current?.focusEmail();
                }}
                className="w-full flex items-center justify-center min-h-[52px] rounded-[4px] text-sm font-semibold text-white transition-colors cursor-pointer"
                style={{ backgroundColor: "#0B1020" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1a2540";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0B1020";
                }}
              >
                Go back and add email
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmNoEmailOpen(false);
                  doCreateOrder();
                }}
                className="w-full flex items-center justify-center min-h-[52px] rounded-[4px] border-2 text-sm font-semibold transition-colors cursor-pointer"
                style={{ borderColor: "#cbd5e1", color: BRAND.ink }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                }}
              >
                Continue without email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
