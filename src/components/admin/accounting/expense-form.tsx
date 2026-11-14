"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createExpense, updateExpense } from "@/actions/admin-accounting";
import {
  ACCOUNT_KEYS,
  ACCOUNT_LABELS,
  BANK_MATCH_LABELS,
  BANK_MATCH_VALUES,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseRow,
} from "@/lib/accounting-types";
import type { ExpenseFacets } from "@/lib/accounting-entry-types";
import {
  CheckField,
  ErrorBanner,
  Field,
  SubmitRow,
  WarningBanner,
  border,
  inputCls,
  selectCls,
} from "./form-bits";

function fmt2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** /admin/accounting/expenses/new + /[id]/edit form (accounting v2). */
export function ExpenseForm({
  mode,
  initial,
  facets,
}: {
  mode: "new" | "edit";
  initial?: ExpenseRow;
  facets?: ExpenseFacets;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<string>(initial?.category ?? "materials");
  const [paidFrom, setPaidFrom] = useState<string>(initial?.paidFrom ?? "bank");
  const [viaPaypal, setViaPaypal] = useState<boolean>(initial?.viaPaypal ?? false);
  const [bankMatch, setBankMatch] = useState<string>(initial?.bankMatch ?? "unchecked");
  const [currency, setCurrency] = useState<string>(initial?.currency ?? "MYR");
  const [original, setOriginal] = useState<string>(initial?.amountOriginal ?? "");
  const [fx, setFx] = useState<string>(initial?.fxRate ?? "");
  const [amount, setAmount] = useState<string>(initial?.amount ?? "");
  // Once she types the MYR amount herself, stop overwriting it from the rate.
  const amountTouched = useRef<boolean>(mode === "edit");

  const foreign = currency.trim().toUpperCase() !== "MYR" && currency.trim() !== "";

  const recalc = (o: string, r: string) => {
    if (amountTouched.current) return;
    const on = parseFloat(o);
    const rn = parseFloat(r);
    if (Number.isFinite(on) && Number.isFinite(rn) && on !== 0 && rn > 0) {
      setAmount(fmt2(on * rn));
    }
  };

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

  const cancel = () => router.push("/admin/accounting/expenses");

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl" style={{ color: BRAND.ink }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ef-date" label="Date">
          <input
            id="ef-date"
            name="expenseDate"
            type="date"
            required
            defaultValue={initial?.expenseDate ?? ""}
            className={inputCls}
            style={border}
          />
        </Field>
        <Field
          id="ef-amount"
          label="Amount (MYR)"
          hint="Use a minus for a refund or credit, for example -100.00."
        >
          <input
            id="ef-amount"
            name="amount"
            type="text"
            required
            inputMode="decimal"
            pattern="-?\d+(\.\d{1,2})?"
            value={amount}
            onChange={(e) => {
              amountTouched.current = true;
              setAmount(e.target.value);
            }}
            className={`${inputCls} tabular-nums`}
            style={border}
            aria-describedby="ef-amount-hint"
          />
        </Field>
      </div>

      <CheckField
        id="ef-estimate"
        name="dateIsEstimate"
        label="The date is an estimate"
        hint="Tick this when the receipt had no date and you guessed it."
        defaultChecked={initial?.dateIsEstimate ?? false}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ef-category" label="Category">
          <select
            id="ef-category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={selectCls}
            style={border}
          >
            {EXPENSE_CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {EXPENSE_CATEGORY_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ef-sub" label="Subcategory (optional)" hint="For example Filament, Lanyard, Packaging.">
          <input
            id="ef-sub"
            name="subcategory"
            type="text"
            maxLength={64}
            list="ef-sub-list"
            defaultValue={initial?.subcategory ?? ""}
            className={inputCls}
            style={border}
          />
          <datalist id="ef-sub-list">
            {(facets?.subcategories ?? []).map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
      </div>

      {category === "shipping" ? (
        <WarningBanner>
          Delyva wallet top-ups are pass-through (the customer pays for shipping), so do not enter them here. Only
          record shipping costs that are really your own expense.
        </WarningBanner>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ef-paidFrom" label="Paid from">
          <select
            id="ef-paidFrom"
            name="paidFrom"
            value={paidFrom}
            onChange={(e) => {
              setPaidFrom(e.target.value);
              if (e.target.value === "paypal") setViaPaypal(false);
            }}
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
        <div className="self-end">
          <CheckField
            id="ef-via"
            name="viaPaypal"
            label="Card charged through PayPal"
            hint="The charge shows as PayPal but came off a card, so it does not reduce the PayPal balance."
            checked={viaPaypal}
            onChange={setViaPaypal}
            disabled={paidFrom === "paypal"}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ef-supplier" label="Supplier or vendor (optional)">
          <input
            id="ef-supplier"
            name="supplierName"
            type="text"
            maxLength={200}
            list="ef-vendor-list"
            defaultValue={initial?.supplierName ?? ""}
            className={inputCls}
            style={border}
          />
          <datalist id="ef-vendor-list">
            {(facets?.vendors ?? []).map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <Field id="ef-project" label="Project tag (optional)" hint="Groups costs for one job, for example jo-melon.">
          <input
            id="ef-project"
            name="projectTag"
            type="text"
            maxLength={64}
            list="ef-project-list"
            defaultValue={initial?.projectTag ?? ""}
            className={inputCls}
            style={border}
          />
          <datalist id="ef-project-list">
            {(facets?.projectTags ?? []).map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field id="ef-note" label="Note (optional)">
        <input
          id="ef-note"
          name="note"
          type="text"
          maxLength={500}
          defaultValue={initial?.note ?? ""}
          className={inputCls}
          style={border}
        />
      </Field>

      <fieldset className="rounded-2xl border-2 p-4 space-y-4" style={{ borderColor: `${BRAND.ink}1f` }}>
        <legend className="px-2 text-sm font-bold">Foreign currency</legend>
        <p className="text-xs text-slate-500 -mt-2">
          The amount above is always the MYR figure. Fill this only when you paid in another currency.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="ef-currency" label="Currency">
            <input
              id="ef-currency"
              name="currency"
              type="text"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${inputCls} uppercase`}
              style={border}
            />
          </Field>
          <Field id="ef-orig" label="Original amount">
            <input
              id="ef-orig"
              name="amountOriginal"
              type="text"
              inputMode="decimal"
              pattern="-?\d+(\.\d{1,2})?"
              disabled={!foreign}
              value={foreign ? original : ""}
              onChange={(e) => {
                setOriginal(e.target.value);
                recalc(e.target.value, fx);
              }}
              className={`${inputCls} tabular-nums disabled:opacity-50`}
              style={border}
            />
          </Field>
          <Field id="ef-fx" label="Rate (MYR per 1)">
            <input
              id="ef-fx"
              name="fxRate"
              type="text"
              inputMode="decimal"
              pattern="\d+(\.\d{1,8})?"
              disabled={!foreign}
              value={foreign ? fx : ""}
              onChange={(e) => {
                setFx(e.target.value);
                recalc(original, e.target.value);
              }}
              className={`${inputCls} tabular-nums disabled:opacity-50`}
              style={border}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border-2 p-4 space-y-4" style={{ borderColor: `${BRAND.ink}1f` }}>
        <legend className="px-2 text-sm font-bold">Bank statement check</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ef-match" label="Bank match">
            <select
              id="ef-match"
              name="bankMatch"
              value={bankMatch}
              onChange={(e) => setBankMatch(e.target.value)}
              className={selectCls}
              style={border}
            >
              {BANK_MATCH_VALUES.map((v) => (
                <option key={v} value={v}>
                  {BANK_MATCH_LABELS[v]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="ef-bankamt" label="Amount on the statement (optional)">
            <input
              id="ef-bankamt"
              name="bankAmount"
              type="text"
              inputMode="decimal"
              pattern="-?\d+(\.\d{1,2})?"
              defaultValue={initial?.bankAmount ?? ""}
              className={`${inputCls} tabular-nums`}
              style={border}
            />
          </Field>
        </div>
        <Field id="ef-ref" label="Reference (optional)" hint="Card statement text or transaction reference.">
          <input
            id="ef-ref"
            name="externalRef"
            type="text"
            maxLength={100}
            defaultValue={initial?.externalRef ?? ""}
            className={inputCls}
            style={border}
          />
        </Field>
      </fieldset>

      {/* Preserve the linked receipt URL on edit. */}
      {initial?.sourceDocUrl ? (
        <input type="hidden" name="sourceDocUrl" defaultValue={initial.sourceDocUrl} />
      ) : null}

      <ErrorBanner error={error} />

      <SubmitRow
        pending={pending}
        label={mode === "new" ? "Add expense" : "Save changes"}
        onCancel={cancel}
      />
    </form>
  );
}
