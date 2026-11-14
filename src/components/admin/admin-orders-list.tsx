"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { bulkDeleteOrders } from "@/actions/admin-orders";
import { bulkSetOrderPaymentMethod } from "@/actions/admin-order-payment-method";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/accounting-types";
import {
  AdminOrderRow,
  AdminOrderCard,
  type AdminOrderRowData,
} from "./admin-order-row";

/**
 * /admin/orders listing with multi-select + bulk delete (2026-06-13).
 * Desktop table + mobile cards both expose a checkbox; a bulk action bar
 * appears once anything is selected. Delete is PERMANENT and warns first.
 */
export function AdminOrdersList({ rows }: { rows: AdminOrderRowData[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tagMethod, setTagMethod] = useState<string>("");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  // Accounting v2 — bulk-tag payment method. The server only touches paid
  // orders whose method is still empty, so an existing method is never
  // overwritten; the notice reports how many actually changed.
  const tagSelected = () => {
    if (selected.size === 0 || !tagMethod) return;
    setError(null);
    setNotice(null);
    const total = selected.size;
    startTransition(async () => {
      const res = await bulkSetOrderPaymentMethod([...selected], tagMethod);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(
        `Tagged ${res.updated} of ${total} selected ${total === 1 ? "order" : "orders"}. ` +
          "Orders that were unpaid or already had a method were left alone.",
      );
      setSelected(new Set());
      setTagMethod("");
      router.refresh();
    });
  };

  const deleteSelected = () => {
    const n = selected.size;
    if (n === 0) return;
    if (
      !confirm(
        `Delete ${n} order${n === 1 ? "" : "s"} PERMANENTLY?\n\n` +
          "This removes the order(s), their items, shipment records and " +
          "payment proofs. It cannot be undone, customers are NOT notified, " +
          "and any Delyva booking or PayPal payment is NOT touched.\n\n" +
          "Only do this for test/junk orders.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await bulkDeleteOrders([...selected]);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-3 border-b"
          style={{ backgroundColor: "#FEF3C7", borderColor: `${BRAND.ink}15` }}
        >
          <p className="text-sm font-semibold flex-1">
            {selected.size} selected
          </p>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={pending}
            className="rounded-full px-4 py-2 text-sm font-semibold min-h-[40px]"
            style={{ border: `2px solid ${BRAND.ink}33`, color: BRAND.ink }}
          >
            Clear
          </button>
          <label className="sr-only" htmlFor="bulk-method">
            Payment method to tag
          </label>
          <select
            id="bulk-method"
            value={tagMethod}
            onChange={(e) => setTagMethod(e.target.value)}
            disabled={pending}
            className="rounded-xl bg-white px-3 text-sm min-h-[40px]"
            style={{ border: `2px solid ${BRAND.ink}33`, color: BRAND.ink }}
          >
            <option value="">Payment method</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={tagSelected}
            disabled={pending || !tagMethod}
            className="rounded-full px-4 py-2 text-sm font-semibold min-h-[40px] text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND.ink }}
          >
            {pending ? "Working..." : "Tag selected"}
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={pending}
            className="rounded-full px-4 py-2 text-sm font-semibold min-h-[40px] text-white disabled:opacity-50"
            style={{ backgroundColor: "#dc2626" }}
          >
            {pending ? "Deleting…" : "Delete selected"}
          </button>
        </div>
      ) : null}
      {notice ? (
        <p
          className="px-4 py-2 text-sm"
          style={{ backgroundColor: "#dcfce7", color: "#166534" }}
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="px-4 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Desktop table — hidden on mobile. Horizontal scroll stays INSIDE the
          card (D3-20); the page never scrolls sideways. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-[760px] w-full text-sm">
          <thead>
            <tr className="text-left" style={{ backgroundColor: `${BRAND.ink}0d` }}>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all orders"
                />
              </th>
              <th className="p-3">Order #</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Date</th>
              <th className="p-3">Items</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <AdminOrderRow
                key={o.id}
                order={o}
                selected={selected.has(o.id)}
                onToggleSelect={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — shown below md */}
      <div className="md:hidden divide-y divide-black/10">
        {rows.map((o) => (
          <AdminOrderCard
            key={o.id}
            order={o}
            selected={selected.has(o.id)}
            onToggleSelect={toggle}
          />
        ))}
      </div>
    </div>
  );
}
