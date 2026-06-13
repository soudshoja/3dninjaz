"use client";

/**
 * OrderItemsEdit — edit surfaces for order line items:
 *   (a) POS-style product tiles + variant/config modal via OrderAddItemsPos
 *   (b) Per-line remove buttons — only shown for unpaid orders (allowRemove)
 *       (This component also exports RemoveLineButton for per-item use.)
 *
 * All mutations use useTransition and router.refresh() on success.
 * Server actions independently re-check editability — the client never
 * passes an "is editable" flag.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { removeLineItem } from "@/actions/admin-order-edit";
import { OrderAddItemsPos } from "@/components/admin/order-add-items-pos";

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

      {/* POS-style product tiles + variant/config modal + manual line form */}
      <OrderAddItemsPos orderId={orderId} />
    </div>
  );
}
