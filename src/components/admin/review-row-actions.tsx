"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { moderateReview, deleteReview } from "@/actions/admin-reviews";

type Row = {
  id: string;
  status: "pending" | "approved" | "hidden";
};

export function ReviewRowActions({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const moderate = (next: "pending" | "approved" | "hidden") => {
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("status", next);
    startTransition(async () => {
      const res = await moderateReview(fd);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  const onDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteReview(row.id);
      if (res.ok) {
        setConfirmOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const buttons: React.ReactNode[] = [];
  if (row.status === "pending") {
    buttons.push(
      <button
        key="approve"
        type="button"
        onClick={() => moderate("approved")}
        disabled={pending}
        className="inline-flex items-center rounded-full px-4 text-xs font-semibold whitespace-nowrap min-h-[40px] text-white disabled:opacity-50"
        style={{ backgroundColor: BRAND.green }}
      >
        Approve
      </button>,
      <button
        key="hide-from-pending"
        type="button"
        onClick={() => moderate("hidden")}
        disabled={pending}
        className="inline-flex items-center rounded-full border-2 px-4 text-xs font-semibold whitespace-nowrap min-h-[40px] disabled:opacity-50"
        style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
      >
        Hide
      </button>,
    );
  } else if (row.status === "approved") {
    buttons.push(
      <button
        key="hide"
        type="button"
        onClick={() => moderate("hidden")}
        disabled={pending}
        className="inline-flex items-center rounded-full border-2 px-4 text-xs font-semibold whitespace-nowrap min-h-[40px] disabled:opacity-50"
        style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
      >
        Hide
      </button>,
    );
  } else {
    buttons.push(
      <button
        key="unhide"
        type="button"
        onClick={() => moderate("approved")}
        disabled={pending}
        className="inline-flex items-center rounded-full px-4 text-xs font-semibold whitespace-nowrap min-h-[40px] text-white disabled:opacity-50"
        style={{ backgroundColor: BRAND.green }}
      >
        Unhide
      </button>,
    );
  }
  buttons.push(
    <button
      key="delete"
      type="button"
      onClick={() => setConfirmOpen(true)}
      disabled={pending}
      className="inline-flex items-center rounded-full border-2 px-4 text-xs font-semibold whitespace-nowrap min-h-[40px] disabled:opacity-50"
      style={{ borderColor: "#dc2626", color: "#dc2626" }}
    >
      Delete
    </button>,
  );

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {buttons}
      {error ? (
        <p role="alert" className="text-xs" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
      {confirmOpen ? (
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
              Delete review?
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              This permanently removes the review. There is no audit log in
              v1; consider Hide if you want it gone but recoverable.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
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
