"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createPayout, updatePayout } from "@/actions/admin-accounting";
import type { PayoutRow } from "@/lib/accounting-types";

const inputCls = "w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]";
const border = { borderColor: `${BRAND.ink}33` };

/** PayPal→Bank/Cash withdrawal. Reduces PayPal balance, adds to destination. */
export function PayoutForm({
  mode,
  initial,
}: {
  mode: "new" | "edit";
  initial?: PayoutRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = mode === "new" ? await createPayout(fd) : await updatePayout(initial!.id, fd);
      if (res.ok) {
        router.push("/admin/accounting/payouts");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl" style={{ color: BRAND.ink }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-date" className="block text-sm font-semibold mb-1">
            Date
          </label>
          <input
            id="pf-date"
            name="payoutDate"
            type="date"
            required
            defaultValue={initial?.payoutDate ?? ""}
            className={inputCls}
            style={border}
          />
        </div>
        <div>
          <label htmlFor="pf-amount" className="block text-sm font-semibold mb-1">
            Amount withdrawn (MYR)
          </label>
          <input
            id="pf-amount"
            name="amount"
            type="text"
            required
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={initial?.amount ?? ""}
            className={inputCls}
            style={border}
            placeholder="1000.00"
          />
        </div>
      </div>

      <div>
        <label htmlFor="pf-into" className="block text-sm font-semibold mb-1">
          Withdrawn into
        </label>
        <select
          id="pf-into"
          name="paidInto"
          defaultValue={initial?.paidInto ?? "bank"}
          className={`${inputCls} bg-white`}
          style={border}
        >
          <option value="bank">Bank</option>
          <option value="cash">Cash</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Money moves out of PayPal into this account.
        </p>
      </div>

      <div>
        <label htmlFor="pf-note" className="block text-sm font-semibold mb-1">
          Note (optional)
        </label>
        <input
          id="pf-note"
          name="note"
          type="text"
          maxLength={500}
          defaultValue={initial?.note ?? ""}
          className={inputCls}
          style={border}
          placeholder="Maybank transfer ref…"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.ink }}
        >
          {pending ? "Saving…" : mode === "new" ? "Add payout" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/accounting/payouts")}
          disabled={pending}
          className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
