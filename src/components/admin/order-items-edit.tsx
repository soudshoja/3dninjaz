"use client";

/**
 * OrderItemsEdit — three edit surfaces for unpaid order line items:
 *   (a) Catalog picker — search for a product, select a variant, set qty, add.
 *   (b) Manual line form — name + qty + unit price → addManualLineItem.
 *   (c) Per-line remove buttons — rendered by the parent page next to each item.
 *       (This component also exports RemoveLineButton for per-item use.)
 *
 * All mutations use useTransition and router.refresh() on success.
 * Server actions independently re-check assertEditable — the client never
 * passes an "is editable" flag.
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Plus, Trash2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import {
  getPosProductSearch,
  type PosProductResult,
} from "@/actions/admin-pos";
import {
  addCatalogLineItem,
  addManualLineItem,
  removeLineItem,
  getOrderEditVariants,
  type OrderEditVariant,
} from "@/actions/admin-order-edit";

// ── Shared UI helpers ──────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border px-3 py-2 text-sm font-medium outline-none transition-colors";
const inputStyle = (brand: typeof BRAND) => ({
  borderColor: `${brand.ink}20`,
  backgroundColor: "#ffffff",
  color: brand.ink,
});

// ── RemoveLineButton ───────────────────────────────────────────────────────────

type RemoveLineButtonProps = {
  orderId: string;
  itemId: string;
  onSuccess?: () => void;
};

export function RemoveLineButton({ orderId, itemId, onSuccess }: RemoveLineButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    setErr(null);
    startTransition(async () => {
      const res = await removeLineItem(orderId, itemId);
      if (res.ok) {
        router.refresh();
        onSuccess?.();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title="Remove line item"
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
        style={{
          color: "#be123c",
          backgroundColor: "#fee2e220",
          border: "1px solid #fca5a540",
          minHeight: 32,
        }}
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        {pending ? "Removing…" : "Remove"}
      </button>
      {err ? (
        <span className="mt-1 text-xs" style={{ color: "#be123c" }}>
          {err}
        </span>
      ) : null}
    </div>
  );
}

// ── CatalogPicker ─────────────────────────────────────────────────────────────

type CatalogPickerProps = {
  orderId: string;
};

function CatalogPicker({ orderId }: CatalogPickerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProductResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PosProductResult | null>(null);
  const [variants, setVariants] = useState<OrderEditVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [qty, setQty] = useState(1);
  const [adding, startAddTransition] = useTransition();
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await getPosProductSearch(query.trim());
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Load variants when a product is selected
  async function selectProduct(product: PosProductResult) {
    setSelectedProduct(product);
    setResults([]);
    setQuery(product.name);
    setSelectedVariantId("");
    setVariants([]);
    setAddError(null);
    setAddSuccess(null);

    if (product.variantCount > 0) {
      setVariantsLoading(true);
      try {
        const vs = await getOrderEditVariants(product.id);
        setVariants(vs);
        if (vs.length === 1) setSelectedVariantId(vs[0].id);
      } catch {
        setVariants([]);
      } finally {
        setVariantsLoading(false);
      }
    }
  }

  function handleAdd() {
    if (!selectedProduct) return;
    if (selectedProduct.variantCount > 0 && !selectedVariantId) {
      setAddError("Please select a variant.");
      return;
    }
    const variantId = selectedProduct.variantCount > 0
      ? selectedVariantId
      : variants[0]?.id ?? "";

    if (!variantId && selectedProduct.variantCount > 0) {
      setAddError("No variant available for this product.");
      return;
    }

    setAddError(null);
    setAddSuccess(null);
    startAddTransition(async () => {
      const res = await addCatalogLineItem(orderId, {
        productId: selectedProduct.id,
        variantId,
        quantity: qty,
      });
      if (res.ok) {
        setAddSuccess(`Added ${selectedProduct.name} ×${qty}.`);
        setQuery("");
        setSelectedProduct(null);
        setVariants([]);
        setSelectedVariantId("");
        setQty(1);
        router.refresh();
      } else {
        setAddError(res.error);
      }
    });
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: `${BRAND.green}06`,
        border: `1.5px solid ${BRAND.green}25`,
      }}
    >
      <p
        className="text-xs font-bold uppercase tracking-wider mb-3"
        style={{ color: BRAND.greenDark }}
      >
        Add catalog product
      </p>

      {/* Search input */}
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
          style={{ color: "#94a3b8" }}
        >
          <Search size={14} />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedProduct) {
              setSelectedProduct(null);
              setVariants([]);
              setSelectedVariantId("");
            }
            setAddError(null);
            setAddSuccess(null);
          }}
          placeholder="Search products…"
          className={inputCls + " pl-9"}
          style={inputStyle(BRAND)}
          autoComplete="off"
        />
        {searching && (
          <div className="absolute inset-y-0 right-3 flex items-center">
            <Loader2 size={14} className="animate-spin" style={{ color: "#94a3b8" }} />
          </div>
        )}
      </div>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <ul
          className="mt-1 rounded-xl overflow-hidden"
          style={{
            border: `1.5px solid ${BRAND.ink}12`,
            boxShadow: `0 4px 16px ${BRAND.ink}0d`,
            backgroundColor: "#ffffff",
          }}
        >
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => selectProduct(p)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50"
                style={{ color: BRAND.ink }}
              >
                <span className="flex-1 font-medium truncate">{p.name}</span>
                {p.minPrice !== null && (
                  <span className="text-xs shrink-0" style={{ color: "#64748b" }}>
                    from {formatMYR(p.minPrice)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Variant selector (when product selected and has variants) */}
      {selectedProduct && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {variantsLoading ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: "#64748b" }}>
              <Loader2 size={13} className="animate-spin" />
              Loading variants…
            </div>
          ) : variants.length > 0 ? (
            <div className="sm:col-span-2">
              <label
                htmlFor="cp-variant"
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  marginBottom: 4,
                  color: "#64748b",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Variant
              </label>
              <select
                id="cp-variant"
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                className={inputCls}
                style={inputStyle(BRAND)}
              >
                <option value="">Select variant…</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={!v.inStock}>
                    {v.label} — {formatMYR(v.price)}
                    {!v.inStock ? " (out of stock)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Quantity */}
          <div>
            <label
              htmlFor="cp-qty"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 4,
                color: "#64748b",
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Quantity
            </label>
            <input
              id="cp-qty"
              type="number"
              min={1}
              max={999}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={inputCls}
              style={inputStyle(BRAND)}
            />
          </div>

          {/* Add button */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: BRAND.green,
                color: "#ffffff",
                minHeight: 40,
              }}
            >
              {adding ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Plus size={15} strokeWidth={2.5} />
              )}
              {adding ? "Adding…" : "Add to order"}
            </button>
          </div>
        </div>
      )}

      {addSuccess && (
        <p className="mt-2 text-xs font-medium" style={{ color: BRAND.greenDark }}>
          {addSuccess}
        </p>
      )}
      {addError && (
        <p className="mt-2 text-xs" style={{ color: "#be123c" }}>
          {addError}
        </p>
      )}
    </div>
  );
}

// ── ManualLineForm ────────────────────────────────────────────────────────────

type ManualLineFormProps = {
  orderId: string;
};

function ManualLineForm({ orderId }: ManualLineFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [pending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);
    startTransition(async () => {
      const res = await addManualLineItem(orderId, {
        name,
        quantity: qty,
        unitPrice: price,
      });
      if (res.ok) {
        setSuccessMsg(`Manual line "${name}" added.`);
        setName("");
        setQty(1);
        setPrice("");
        router.refresh();
      } else {
        setErrorMsg(res.error);
      }
    });
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: `${BRAND.purple}06`,
        border: `1.5px solid ${BRAND.purple}20`,
      }}
    >
      <p
        className="text-xs font-bold uppercase tracking-wider mb-3"
        style={{ color: BRAND.purple }}
      >
        Add manual line item
      </p>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Name */}
          <div className="sm:col-span-3">
            <label
              htmlFor="ml-name"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 4,
                color: "#64748b",
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Item name
            </label>
            <input
              id="ml-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSuccessMsg(null); setErrorMsg(null); }}
              placeholder="e.g. Packaging, Custom part…"
              className={inputCls}
              style={inputStyle(BRAND)}
              required
              maxLength={200}
              autoComplete="off"
            />
          </div>

          {/* Quantity */}
          <div>
            <label
              htmlFor="ml-qty"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 4,
                color: "#64748b",
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Qty
            </label>
            <input
              id="ml-qty"
              type="number"
              min={1}
              max={9999}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={inputCls}
              style={inputStyle(BRAND)}
              required
            />
          </div>

          {/* Unit price */}
          <div>
            <label
              htmlFor="ml-price"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 4,
                color: "#64748b",
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Unit price (MYR)
            </label>
            <input
              id="ml-price"
              type="text"
              value={price}
              onChange={(e) => { setPrice(e.target.value); setSuccessMsg(null); setErrorMsg(null); }}
              placeholder="e.g. 5.00"
              className={inputCls}
              style={inputStyle(BRAND)}
              required
              pattern="^\d+(\.\d{1,2})?$"
              autoComplete="off"
            />
          </div>

          {/* Submit */}
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: BRAND.purple,
                color: "#ffffff",
                minHeight: 40,
              }}
            >
              {pending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Plus size={15} strokeWidth={2.5} />
              )}
              {pending ? "Adding…" : "Add line"}
            </button>
          </div>
        </div>

        {successMsg && (
          <p className="mt-2 text-xs font-medium" style={{ color: BRAND.greenDark }}>
            {successMsg}
          </p>
        )}
        {errorMsg && (
          <p className="mt-2 text-xs" style={{ color: "#be123c" }}>
            {errorMsg}
          </p>
        )}
      </form>
    </div>
  );
}

// ── OrderItemsEdit — main exported component ──────────────────────────────────

export type EditableItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  isManual: boolean;
};

type Props = {
  orderId: string;
  items: EditableItem[];
  /**
   * Whether existing lines can be removed. True for unpaid orders; false for
   * paid orders where the admin may only ADD items (creating a balance due) —
   * already-paid lines stay put (2026-06-13).
   */
  allowRemove?: boolean;
};

export function OrderItemsEdit({ orderId, items, allowRemove = true }: Props) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div
        className="flex items-center gap-2 pb-3"
        style={{ borderBottom: `1.5px solid ${BRAND.ink}0c` }}
      >
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: BRAND.greenDark }}
        >
          {allowRemove ? "Edit line items" : "Add more items"}
        </span>
      </div>

      {/* Per-line remove buttons — only when removal is allowed (unpaid). */}
      {allowRemove && items.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: `${BRAND.ink}03`,
            border: `1.5px solid ${BRAND.ink}0c`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: "#64748b" }}
          >
            Remove existing lines
          </p>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                style={{
                  backgroundColor: "#ffffff",
                  border: `1px solid ${BRAND.ink}0c`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: BRAND.ink }}>
                    {item.productName}
                    {item.isManual && (
                      <span
                        className="ml-1.5 text-xs px-1.5 py-0.5 rounded-md font-semibold"
                        style={{ color: BRAND.purple, backgroundColor: `${BRAND.purple}12` }}
                      >
                        manual
                      </span>
                    )}
                  </span>
                  <span className="text-xs" style={{ color: "#64748b" }}>
                    Qty {item.quantity} · {formatMYR(item.unitPrice)} each
                  </span>
                </div>
                <RemoveLineButton orderId={orderId} itemId={item.id} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Catalog product picker */}
      <CatalogPicker orderId={orderId} />

      {/* Manual line form */}
      <ManualLineForm orderId={orderId} />
    </div>
  );
}
