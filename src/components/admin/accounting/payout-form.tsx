"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createPayout, updatePayout } from "@/actions/admin-accounting";
import { ACCOUNT_KEYS, ACCOUNT_LABELS, type PayoutRow } from "@/lib/accounting-types";
import { ErrorBanner, Field, SubmitRow, border, inputCls, selectCls } from "./form-bits";

/**
 * Transfer between two of our own accounts (for example PayPal to bank).
 * Money leaves `from` and lands in `into`. It is not income and not an expense.
 */
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
  const [from, setFrom] = useState(initial?.fromAccount ?? "paypal");
  const [into, setInto] = useState(initial?.paidInto ?? "bank");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (from === into) {
      setError("Transfer must go between two different accounts");
      return;
    }
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
        <Field id="pf-date" label="Date">
          <input
            id="pf-date"
            name="payoutDate"
            type="date"
            required
            defaultValue={initial?.payoutDate ?? ""}
            className={inputCls}
            style={border}
          />
        </Field>
        <Field id="pf-amount" label="Amount moved (MYR)">
          <input
            id="pf-amount"
            name="amount"
            type="text"
            required
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={initial?.amount ?? ""}
            className={`${inputCls} tabular-nums`}
            style={border}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pf-from" label="Moved from">
          <select
            id="pf-from"
            name="fromAccount"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={selectCls}
            style={border}
          >
            {ACCOUNT_KEYS.map((v) => (
              <option key={v} value={v}>
                {ACCOUNT_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="pf-into" label="Moved into">
          <select
            id="pf-into"
            name="paidInto"
            value={into}
            onChange={(e) => setInto(e.target.value)}
            className={selectCls}
            style={border}
          >
            {ACCOUNT_KEYS.map((v) => (
              <option key={v} value={v}>
                {ACCOUNT_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Moving money into the credit card account pays down what you owe on it.
      </p>

      <Field id="pf-note" label="Note (optional)">
        <input
          id="pf-note"
          name="note"
          type="text"
          maxLength={500}
          defaultValue={initial?.note ?? ""}
          className={inputCls}
          style={border}
        />
      </Field>

      <ErrorBanner error={error} />

      <SubmitRow
        pending={pending}
        label={mode === "new" ? "Add transfer" : "Save changes"}
        onCancel={() => router.push("/admin/accounting/payouts")}
      />
    </form>
  );
}
