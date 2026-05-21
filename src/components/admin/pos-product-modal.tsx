"use client";

/**
 * POS Quick-Add Modal — wraps the real <ProductDetail> PDP inside a centered
 * dialog so admins can configure variant/colour/keychain fields before adding
 * to the order ticket.
 *
 * Props:
 *   productId  — which product to hydrate
 *   open       — controlled visibility
 *   onClose()  — called on overlay click, X button, or Escape
 *   onAdd(line)— called with the PosAddToOrderLine; modal closes immediately after
 */

import { useEffect, useRef, useState } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { getPosProductHydration, type PosProductHydration } from "@/actions/admin-pos";
import { ProductDetail, type PosAddToOrderLine } from "@/components/store/product-detail";

type Props = {
  productId: string;
  open: boolean;
  onClose: () => void;
  onAdd: (line: PosAddToOrderLine) => void;
};

export function PosProductModal({ productId, open, onClose, onAdd }: Props) {
  const [hydration, setHydration] = useState<PosProductHydration | null | "loading">("loading");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Fetch hydration when modal opens / productId changes
  useEffect(() => {
    if (!open) return;
    setHydration("loading");
    getPosProductHydration(productId)
      .then((h) => setHydration(h))
      .catch(() => setHydration(null));
  }, [open, productId]);

  // Escape key closes modal
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Focus the close button when modal opens
  useEffect(() => {
    if (open && hydration !== "loading" && closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [open, hydration]);

  if (!open) return null;

  function handleAdd(line: PosAddToOrderLine) {
    onAdd(line);
    onClose();
  }

  const productName =
    hydration !== "loading" && hydration !== null
      ? hydration.product.name
      : "Loading…";

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(11,16,32,0.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${productName}`}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        className="relative flex flex-col bg-white rounded-xl overflow-hidden"
        style={{
          maxWidth: 680,
          width: "92vw",
          maxHeight: "88vh",
          boxShadow: "0 24px 64px rgba(0,0,0,0.32)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b-2 border-slate-200 bg-white shrink-0"
        >
          <span
            className="flex-1 font-semibold text-base truncate"
            style={{ color: BRAND.ink }}
          >
            {productName}
          </span>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-400 hover:text-slate-700 transition-colors shrink-0"
            style={{ minWidth: 40, minHeight: 40 }}
            aria-label="Close product picker"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {hydration === "loading" ? (
            /* Spinner — reserve space so panel doesn't jump */
            <div className="flex flex-col items-center justify-center gap-3 py-20 px-8 text-slate-500">
              <Loader2 size={36} className="animate-spin" style={{ color: "#0080ff" }} />
              <p className="text-sm">Loading product details…</p>
            </div>
          ) : hydration === null ? (
            /* Error state */
            <div className="flex flex-col items-center justify-center gap-3 py-20 px-8">
              <AlertCircle size={36} className="text-red-400" />
              <p className="text-sm text-slate-600 text-center">
                Could not load this product. It may have been removed.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 min-h-[48px] px-6 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: "#0080ff" }}
              >
                Close
              </button>
            </div>
          ) : (
            /* Full customer PDP — onAddToOrder wires up to our handler */
            <ProductDetail
              product={hydration.product}
              pictures={hydration.pictures}
              variantPictures={hydration.variantPictures}
              configurableData={hydration.configurableData}
              isWishlistedInitial={false}
              ratingAvg={0}
              ratingCount={0}
              onAddToOrder={handleAdd}
            />
          )}
        </div>
      </div>
    </div>
  );
}
