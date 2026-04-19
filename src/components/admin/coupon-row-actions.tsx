"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  deactivateCoupon,
  reactivateCoupon,
  deleteCoupon,
} from "@/actions/admin-coupons";

type Row = {
  id: string;
  code: string;
  active: boolean;
  usageCount: number;
};

/**
 * Inline row action buttons for /admin/coupons. No DropdownMenu — three
 * buttons are easier to spot on the same row.
 */
export function CouponRowActions({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const onToggleActive = () => {
    setError(null);
    startTransition(async () => {
      const res = row.active
        ? await deactivateCoupon(row.id)
        : await reactivateCoupon(row.id);
      if (res.ok) {
        router.refresh();
      } else if ("error" in res) {
        setError(res.error);
      }
    });
  };

  const onDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteCoupon(row.id);
      if (res.ok) {
        setShowConfirm(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Link
        href={`/admin/coupons/${row.id}/edit`}
        className="inline-flex items-center rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap min-h-[40px]"
        style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={onToggleActive}
        disabled={pending}
        className="inline-flex items-center rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap min-h-[40px] disabled:opacity-50"
        style={{
          borderColor: row.active ? BRAND.purple : BRAND.green,
          color: row.active ? BRAND.purple : BRAND.green,
        }}
      >
        {row.active ? "Deactivate" : "Reactivate"}
      </button>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={pending}
        className="inline-flex items-center rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap min-h-[40px] disabled:opacity-50"
        style={{ borderColor: "#dc2626", color: "#dc2626" }}
      >
        Delete
      </button>
      {error ? (
        <p role="alert" className="text-xs" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
      {showConfirm ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6"
            style={{ color: BRAND.ink }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-2">
              Delete coupon {row.code}?
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              This is permanent. If the coupon has any redemptions, deletion
              will be refused — deactivate instead to preserve audit history.
            </p>
            {error ? (
              <p
                role="alert"
                className="rounded-xl px-3 py-2 text-sm mb-3"
                style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
              >
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setError(null);
                }}
                disabled={pending}
                className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
                style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
                style={{ backgroundColor: "#dc2626" }}
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
