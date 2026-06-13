"use client";

/**
 * OrderAddItemsPos — POS-style product picker for adding items to an existing order.
 *
 * Reuses the same components/actions as the POS builder:
 *   - getPosRecentProducts() / getPosProductSearch() — product tile grid
 *   - PosProductModal — variant/config modal (full ProductDetail PDP inside a dialog)
 *   - addPosLineToOrder() — server action that inserts the line with server-side
 *     price resolution (mirrors createPosOrder's stocked + configurable branches)
 *   - addManualLineItem() — existing free-text line action (unchanged)
 *
 * Props: { orderId: string }
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Plus, Package } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import {
  getPosRecentProducts,
  getPosProductSearch,
  type PosProductResult,
} from "@/actions/admin-pos";
import { addPosLineToOrder, addManualLineItem } from "@/actions/admin-order-edit";
import { PosProductModal } from "@/components/admin/pos-product-modal";
import type { PosAddToOrderLine } from "@/components/store/product-detail";

// ── Shared UI helpers ──────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border px-3 py-2 text-sm font-medium outline-none transition-colors";
const inputStyle = {
  borderColor: `${BRAND.ink}20`,
  backgroundColor: "#ffffff",
  color: BRAND.ink,
} as React.CSSProperties;

const labelStyle = {
  display: "block" as const,
  fontSize: 11,
  fontWeight: 600,
  marginBottom: 4,
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

// ── ProductTileGrid ────────────────────────────────────────────────────────────

type TileGridProps = {
  products: PosProductResult[];
  loading: boolean;
  onSelect: (p: PosProductResult) => void;
};

function ProductTileGrid({ products, loading, onSelect }: TileGridProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: "#94a3b8" }}>
        <Loader2 size={16} className="animate-spin" />
        Loading products…
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "#94a3b8" }}>
        No products found.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {products.map((p) => {
        const isConfig =
          p.productType === "configurable" ||
          p.productType === "keychain";
        const hint = isConfig ? "CONFIG" : p.variantCount > 1 ? "OPTIONS" : null;

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className="flex flex-col items-start gap-1.5 rounded-xl p-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2"
            style={{
              border: `1.5px solid ${BRAND.ink}10`,
              backgroundColor: "#ffffff",
              minHeight: 44,
            }}
          >
            {/* Thumbnail */}
            <div
              className="w-full rounded-lg overflow-hidden flex items-center justify-center"
              style={{ aspectRatio: "1", backgroundColor: `${BRAND.ink}06` }}
            >
              {p.thumbnailUrl ? (
                // Using <img> (same pattern as pos-builder.tsx) to avoid next/image
                // domain config overhead for the admin panel.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnailUrl}
                  alt={p.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Package size={20} style={{ color: `${BRAND.ink}30` }} />
              )}
            </div>

            {/* Name */}
            <span
              className="text-xs font-semibold leading-tight line-clamp-2 w-full"
              style={{ color: BRAND.ink }}
            >
              {p.name}
            </span>

            {/* Price + config hint */}
            <div className="flex items-center gap-1.5 w-full flex-wrap">
              {p.minPrice !== null && (
                <span className="text-xs" style={{ color: "#64748b" }}>
                  {formatMYR(p.minPrice)}
                </span>
              )}
              {hint && (
                <span
                  className="text-xs font-bold px-1 rounded"
                  style={{
                    fontSize: 9,
                    backgroundColor: `${BRAND.blue}15`,
                    color: BRAND.blue,
                  }}
                >
                  {hint}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── ManualLineSubForm ──────────────────────────────────────────────────────────

function ManualLineSubForm({ orderId }: { orderId: string }) {
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
          <div className="sm:col-span-3">
            <label htmlFor="oap-ml-name" style={labelStyle}>Item name</label>
            <input
              id="oap-ml-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSuccessMsg(null); setErrorMsg(null); }}
              placeholder="e.g. Packaging, Custom part…"
              className={inputCls}
              style={inputStyle}
              required
              maxLength={200}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="oap-ml-qty" style={labelStyle}>Qty</label>
            <input
              id="oap-ml-qty"
              type="number"
              min={1}
              max={9999}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={inputCls}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label htmlFor="oap-ml-price" style={labelStyle}>Unit price (MYR)</label>
            <input
              id="oap-ml-price"
              type="text"
              value={price}
              onChange={(e) => { setPrice(e.target.value); setSuccessMsg(null); setErrorMsg(null); }}
              placeholder="e.g. 5.00"
              className={inputCls}
              style={inputStyle}
              required
              pattern="^\d+(\.\d{1,2})?$"
              autoComplete="off"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: BRAND.purple, color: "#ffffff", minHeight: 40 }}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.5} />}
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

// ── OrderAddItemsPos — main export ─────────────────────────────────────────────

export function OrderAddItemsPos({ orderId }: { orderId: string }) {
  const router = useRouter();

  // Product tile grid state
  const [query, setQuery] = useState("");
  const [tiles, setTiles] = useState<PosProductResult[]>([]);
  const [tilesLoading, setTilesLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [modalProductId, setModalProductId] = useState<string | null>(null);

  // Add transition / feedback
  const [addPending, startAddTransition] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Load initial recent products on mount
  useEffect(() => {
    setTilesLoading(true);
    getPosRecentProducts()
      .then(setTiles)
      .catch(() => setTiles([]))
      .finally(() => setTilesLoading(false));
  }, []);

  // Debounced search — 350 ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      // Empty query → reload recents
      setTilesLoading(true);
      getPosRecentProducts()
        .then(setTiles)
        .catch(() => setTiles([]))
        .finally(() => setTilesLoading(false));
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setTilesLoading(true);
      try {
        const res = await getPosProductSearch(query.trim());
        setTiles(res);
      } catch {
        setTiles([]);
      } finally {
        setTilesLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleTileClick(p: PosProductResult) {
    setAddError(null);
    setAddSuccess(null);
    setModalProductId(p.id);
  }

  function handleModalAdd(line: PosAddToOrderLine) {
    setAddError(null);
    setAddSuccess(null);
    setModalProductId(null); // close modal immediately
    startAddTransition(async () => {
      const res = await addPosLineToOrder(orderId, line);
      if (res.ok) {
        setAddSuccess(`"${line.productName}" added to order.`);
        router.refresh();
      } else {
        setAddError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Catalog tile picker ── */}
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

        {/* Search box */}
        <div className="relative mb-3">
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
              setAddError(null);
              setAddSuccess(null);
            }}
            placeholder="Search products…"
            className={inputCls + " pl-9"}
            style={inputStyle}
            autoComplete="off"
          />
          {tilesLoading && (
            <div className="absolute inset-y-0 right-3 flex items-center">
              <Loader2 size={14} className="animate-spin" style={{ color: "#94a3b8" }} />
            </div>
          )}
        </div>

        {/* Tile grid */}
        <ProductTileGrid
          products={tiles}
          loading={tilesLoading}
          onSelect={handleTileClick}
        />

        {/* Inline feedback */}
        {addPending && (
          <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: "#64748b" }}>
            <Loader2 size={13} className="animate-spin" />
            Adding…
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

      {/* ── Manual free-text line ── */}
      <ManualLineSubForm orderId={orderId} />

      {/* ── POS product modal ── */}
      {modalProductId && (
        <PosProductModal
          productId={modalProductId}
          open={true}
          onClose={() => setModalProductId(null)}
          onAdd={handleModalAdd}
        />
      )}
    </div>
  );
}
