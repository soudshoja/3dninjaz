"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import {
  applyOrderDiscount,
  deleteOrder,
  updateOrderStatus,
} from "@/actions/admin-orders";
import type { OrderStatus } from "@/lib/orders";

/**
 * Admin order management block: apply/clear a discount, cancel the order, or
 * delete it. Rendered on the admin order detail page.
 *
 * - Discount + cancel are only meaningful before payment is collected; the
 *   server actions enforce the allowed statuses, the UI just hides controls
 *   that can't apply.
 * - Delete is destructive + irreversible — gated behind a typed confirmation.
 */
export function AdminOrderManage({
  orderId,
  status,
  discountAmount,
  discountCode,
}: {
  orderId: string;
  status: OrderStatus;
  discountAmount: string;
  discountCode: string | null;
}) {
  const router = useRouter();
  const currentDiscount = parseFloat(discountAmount || "0");

  const prePayment =
    status === "pending" ||
    status === "awaiting_customer" ||
    status === "awaiting_payment_review";
  const cancellable = prePayment || status === "paid" || status === "processing";

  // --- Discount state ---
  const [mode, setMode] = useState<"code" | "manual">("code");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [discPending, startDisc] = useTransition();
  const [discMsg, setDiscMsg] = useState<string | null>(null);

  // --- Cancel / delete state ---
  const [cancelPending, startCancel] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  function applyDiscount(clear = false) {
    setDiscMsg(null);
    startDisc(async () => {
      const res = await applyOrderDiscount(orderId, {
        code: clear ? null : mode === "code" ? code.trim() : null,
        amount: clear ? 0 : mode === "manual" ? parseFloat(amount) || 0 : null,
      });
      if (res.ok) {
        setDiscMsg(clear ? "Discount cleared." : "Discount applied.");
        setCode("");
        setAmount("");
        router.refresh();
      } else {
        setDiscMsg(res.error ?? "Failed.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Discount ─────────────────────────────────────────────── */}
      {prePayment ? (
        <div>
          <h3 className="font-[var(--font-heading)] text-lg mb-1">Discount</h3>
          {currentDiscount > 0 ? (
            <p className="text-sm mb-3" style={{ color: BRAND.green }}>
              Applied: −{formatMYR(currentDiscount)}
              {discountCode ? ` (${discountCode})` : ""}
            </p>
          ) : (
            <p className="text-sm text-slate-500 mb-3">No discount applied.</p>
          )}

          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setMode("code")}
              className="rounded-full px-3 py-1.5 text-xs font-semibold border-2"
              style={{
                borderColor: mode === "code" ? BRAND.ink : "#e4e4e7",
                backgroundColor: mode === "code" ? BRAND.ink : "#fff",
                color: mode === "code" ? "#fff" : BRAND.ink,
              }}
            >
              Coupon code
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className="rounded-full px-3 py-1.5 text-xs font-semibold border-2"
              style={{
                borderColor: mode === "manual" ? BRAND.ink : "#e4e4e7",
                backgroundColor: mode === "manual" ? BRAND.ink : "#fff",
                color: mode === "manual" ? "#fff" : BRAND.ink,
              }}
            >
              Manual amount
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {mode === "code" ? (
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="COUPON CODE"
                className="flex-1 rounded-xl border-2 px-4 py-2.5 text-sm uppercase"
                style={{ borderColor: "#e4e4e7" }}
              />
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount in RM (e.g. 5.00)"
                className="flex-1 rounded-xl border-2 px-4 py-2.5 text-sm"
                style={{ borderColor: "#e4e4e7" }}
              />
            )}
            <button
              type="button"
              disabled={discPending}
              onClick={() => applyDiscount(false)}
              className="rounded-full px-5 py-2.5 font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND.green }}
            >
              {discPending ? "…" : "Apply"}
            </button>
            {currentDiscount > 0 && (
              <button
                type="button"
                disabled={discPending}
                onClick={() => applyDiscount(true)}
                className="rounded-full px-4 py-2.5 font-semibold border-2 disabled:opacity-50"
                style={{ borderColor: "#e4e4e7", color: BRAND.ink }}
              >
                Clear
              </button>
            )}
          </div>
          {discMsg && (
            <p role="status" className="text-sm mt-2">{discMsg}</p>
          )}
        </div>
      ) : null}

      {/* ── Cancel ───────────────────────────────────────────────── */}
      {cancellable && (
        <div>
          <h3 className="font-[var(--font-heading)] text-lg mb-2">Cancel order</h3>
          <button
            type="button"
            disabled={cancelPending}
            onClick={() => {
              if (!window.confirm("Cancel this order? The customer keeps a record but the order is marked cancelled.")) return;
              setActionMsg(null);
              startCancel(async () => {
                const res = await updateOrderStatus(orderId, "cancelled" as OrderStatus);
                setActionMsg(res.ok ? "Order cancelled." : res.error ?? "Failed.");
                if (res.ok) router.refresh();
              });
            }}
            className="rounded-full px-5 py-2.5 font-semibold border-2 disabled:opacity-50"
            style={{ borderColor: "#f59e0b", color: "#b45309" }}
          >
            {cancelPending ? "Cancelling…" : "Cancel order"}
          </button>
        </div>
      )}

      {/* ── Delete (destructive) ─────────────────────────────────── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
        <h3 className="font-[var(--font-heading)] text-lg mb-1" style={{ color: "#991b1b" }}>
          Delete order
        </h3>
        <p className="text-xs text-red-700 mb-3">
          Permanently removes this order and all its items, payment proofs, and
          shipment records. This cannot be undone. Type <strong>DELETE</strong> to confirm.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="flex-1 rounded-xl border-2 px-4 py-2.5 text-sm"
            style={{ borderColor: "#fecaca" }}
          />
          <button
            type="button"
            disabled={deletePending || confirmText !== "DELETE"}
            onClick={() => {
              setActionMsg(null);
              startDelete(async () => {
                const res = await deleteOrder(orderId);
                if (res.ok) {
                  router.push("/admin/orders");
                } else {
                  setActionMsg(res.error ?? "Failed.");
                }
              });
            }}
            className="rounded-full px-5 py-2.5 font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: "#dc2626" }}
          >
            {deletePending ? "Deleting…" : "Delete order"}
          </button>
        </div>
      </div>

      {actionMsg && <p role="status" className="text-sm">{actionMsg}</p>}
    </div>
  );
}
