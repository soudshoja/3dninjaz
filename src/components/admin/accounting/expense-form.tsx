"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createExpense, updateExpense } from "@/actions/admin-accounting";
import type { ExpenseRow } from "@/lib/accounting-types";

const CATEGORIES = [
  ["materials", "Materials"],
  ["utilities", "Utilities"],
  ["marketing", "Marketing"],
  ["shipping", "Shipping"],
  ["equipment", "Equipment"],
  ["other", "Other"],
] as const;

const ACCOUNTS = [
  ["bank", "Bank"],
  ["paypal", "PayPal"],
  ["cash", "Cash"],
] as const;

const inputCls = "w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]";
const border = { borderColor: `${BRAND.ink}33` };

/** /admin/accounting/expenses/new + /[id]/edit form. All tap targets ≥48px. */
export function ExpenseForm({
  mode,
  initial,
}: {
  mode: "new" | "edit";
  initial?: ExpenseRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res =
        mode === "new" ? await createExpense(fd) : await updateExpense(initial!.id, fd);
      if (res.ok) {
        router.push("/admin/accounting/expenses");
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
          <label htmlFor="ef-date" className="block text-sm font-semibold mb-1">
            Date
          </label>
          <input
            id="ef-date"
            name="expenseDate"
            type="date"
            required
            defaultValue={initial?.expenseDate ?? ""}
            className={inputCls}
            style={border}
          />
        </div>
        <div>
          <label htmlFor="ef-amount" className="block text-sm font-semibold mb-1">
            Amount (MYR)
          </label>
          <input
            id="ef-amount"
            name="amount"
            type="text"
            required
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={initial?.amount ?? ""}
            className={inputCls}
            style={border}
            placeholder="50.00"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ef-category" className="block text-sm font-semibold mb-1">
            Category
          </label>
          <select
            id="ef-category"
            name="category"
            defaultValue={initial?.category ?? "materials"}
            className={`${inputCls} bg-white`}
            style={border}
          >
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ef-paidFrom" className="block text-sm font-semibold mb-1">
            Paid from
          </label>
          <select
            id="ef-paidFrom"
            name="paidFrom"
            defaultValue={initial?.paidFrom ?? "bank"}
            className={`${inputCls} bg-white`}
            style={border}
          >
            {ACCOUNTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="ef-supplier" className="block text-sm font-semibold mb-1">
          Supplier / vendor (optional)
        </label>
        <input
          id="ef-supplier"
          name="supplierName"
          type="text"
          maxLength={200}
          defaultValue={initial?.supplierName ?? ""}
          className={inputCls}
          style={border}
          placeholder="ACME Filament Sdn Bhd"
        />
      </div>

      <div>
        <label htmlFor="ef-note" className="block text-sm font-semibold mb-1">
          Note (optional)
        </label>
        <input
          id="ef-note"
          name="note"
          type="text"
          maxLength={500}
          defaultValue={initial?.note ?? ""}
          className={inputCls}
          style={border}
          placeholder="2 kg PLA, black"
        />
      </div>

      {/* Preserve the linked receipt URL on edit. */}
      {initial?.sourceDocUrl ? (
        <input type="hidden" name="sourceDocUrl" defaultValue={initial.sourceDocUrl} />
      ) : null}

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
          {pending ? "Saving…" : mode === "new" ? "Add expense" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/accounting/expenses")}
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
