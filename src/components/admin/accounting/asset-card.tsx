"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createAssetPayment, updateAssetPayment } from "@/actions/admin-accounting";
import {
  ACCOUNT_KEYS,
  ACCOUNT_LABELS,
  BANK_MATCH_LABELS,
  BANK_MATCH_VALUES,
  type AccountKey,
} from "@/lib/accounting-types";
import type { AssetWithPayments } from "@/lib/accounting-entry-types";
import { fmtMoney, todayMYT } from "@/lib/accounting-format";
import { DeleteButton } from "./delete-button";
import { ErrorBanner, Field, MatchBadge, SubmitRow, border, inputCls, selectCls } from "./form-bits";

/** "2 of 24 paid, RM 3,482.38 left" / "Paid in full" / "RM 100.00 paid, RM 50.00 left". */
function progressLine(a: AssetWithPayments): string {
  const instalments = a.instalmentCount ?? 0;
  if (a.remaining <= 0.004) return "Paid in full";
  if (instalments > 0) {
    return `${a.paymentCount} of ${instalments} paid, ${fmtMoney(a.remaining)} left`;
  }
  if (a.paymentCount === 0) return `Nothing paid yet, ${fmtMoney(a.remaining)} left`;
  return `${fmtMoney(a.paidTotal)} paid, ${fmtMoney(a.remaining)} left`;
}

function PaymentForm({
  asset,
  payment,
  onDone,
}: {
  asset: AssetWithPayments;
  payment?: AssetWithPayments["payments"][number];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const instalment = Number(asset.instalmentAmount ?? 0);
  const nextNo =
    Math.max(asset.paymentCount, ...asset.payments.map((p) => p.instalmentNo ?? 0)) + 1;
  const defaultAmount = payment
    ? payment.amount
    : (instalment > 0 ? Math.min(instalment, Math.max(asset.remaining, 0)) : Math.max(asset.remaining, 0)).toFixed(2);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("assetId", asset.id);
    startTransition(async () => {
      const res = payment ? await updateAssetPayment(payment.id, fd) : await createAssetPayment(fd);
      if (res.ok) {
        router.refresh();
        onDone();
      } else {
        setError(res.error);
      }
    });
  };

  const id = (s: string) => `ap-${asset.id}-${payment?.id ?? "new"}-${s}`;

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 space-y-3 rounded-2xl border-2 p-4"
      style={{ borderColor: `${BRAND.ink}1f`, backgroundColor: `${BRAND.ink}05` }}
    >
      <p className="text-sm font-bold">{payment ? "Edit payment" : `Record payment for ${asset.name}`}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={id("date")} label="Date paid">
          <input
            id={id("date")}
            name="paymentDate"
            type="date"
            required
            defaultValue={payment?.paymentDate ?? todayMYT()}
            className={inputCls}
            style={border}
          />
        </Field>
        <Field id={id("amount")} label="Amount (MYR)">
          <input
            id={id("amount")}
            name="amount"
            type="text"
            required
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={defaultAmount}
            className={`${inputCls} tabular-nums`}
            style={border}
          />
        </Field>
        <Field id={id("no")} label="Instalment number">
          <input
            id={id("no")}
            name="instalmentNo"
            type="number"
            min={1}
            max={600}
            defaultValue={payment ? (payment.instalmentNo ?? "") : instalment > 0 ? nextNo : ""}
            className={`${inputCls} tabular-nums`}
            style={border}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id("from")} label="Paid from">
          <select
            id={id("from")}
            name="paidFrom"
            defaultValue={(payment?.paidFrom ?? asset.paidFrom ?? "bank") as AccountKey}
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
        <Field id={id("match")} label="Bank match">
          <select
            id={id("match")}
            name="bankMatch"
            defaultValue={payment?.bankMatch ?? "unchecked"}
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
      </div>
      <Field id={id("note")} label="Note (optional)">
        <input
          id={id("note")}
          name="note"
          type="text"
          maxLength={500}
          defaultValue={payment?.note ?? ""}
          className={inputCls}
          style={border}
        />
      </Field>
      <ErrorBanner error={error} />
      <SubmitRow
        pending={pending}
        label={payment ? "Save payment" : "Record payment"}
        onCancel={onDone}
      />
    </form>
  );
}

/** One asset: totals, progress line and bar, payment history, Record payment. */
export function AssetCard({ asset }: { asset: AssetWithPayments }) {
  const [recording, setRecording] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const total = Number(asset.amount);
  const pct = total > 0 ? Math.min(100, Math.max(0, (asset.paidTotal / total) * 100)) : 0;
  const done = asset.remaining <= 0.004;

  return (
    <li className="p-4 md:p-5" style={{ color: BRAND.ink }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold text-lg break-words">{asset.name}</h2>
          <p className="text-xs text-slate-500">
            {asset.assetDate}
            {asset.seller ? ` · ${asset.seller}` : ""} · paid from {ACCOUNT_LABELS[(asset.paidFrom ?? "bank") as AccountKey]}
          </p>
        </div>
        <p className="text-right tabular-nums font-bold text-lg shrink-0">{fmtMoney(asset.amount)}</p>
      </div>

      <div className="mt-3">
        <div
          className="h-2 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: `${BRAND.ink}14` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={`${asset.name} payment progress`}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: done ? BRAND.green : BRAND.blue }}
          />
        </div>
        <p className="mt-1.5 text-sm font-semibold tabular-nums">{progressLine(asset)}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!done ? (
          <button
            type="button"
            onClick={() => {
              setRecording((v) => !v);
              setEditingId(null);
            }}
            aria-expanded={recording}
            className="inline-flex items-center justify-center rounded-full px-5 font-semibold text-white min-h-[44px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            {recording ? "Close" : "Record payment"}
          </button>
        ) : null}
        <Link
          href={`/admin/accounting/assets/${asset.id}/edit`}
          className="inline-flex items-center justify-center rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        >
          Edit
        </Link>
        <DeleteButton
          kind="asset"
          id={asset.id}
          warning={asset.paymentCount > 0 ? "Its recorded payments are deleted too." : undefined}
        />
      </div>

      {recording ? <PaymentForm asset={asset} onDone={() => setRecording(false)} /> : null}

      {asset.payments.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold min-h-[44px] flex items-center">
            Payments ({asset.payments.length})
          </summary>
          <ul className="divide-y divide-black/10">
            {asset.payments.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <span className="font-mono text-xs">{p.paymentDate}</span>
                    {p.instalmentNo ? <span className="ml-2 text-slate-500">Instalment {p.instalmentNo}</span> : null}
                    <span className="ml-2 text-slate-500">{ACCOUNT_LABELS[p.paidFrom as AccountKey] ?? p.paidFrom}</span>
                    <span className="ml-2">
                      <MatchBadge value={p.bankMatch} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-semibold">{fmtMoney(p.amount)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(editingId === p.id ? null : p.id);
                        setRecording(false);
                      }}
                      className="rounded-full border-2 px-4 text-sm font-semibold min-h-[44px]"
                      style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                    >
                      {editingId === p.id ? "Close" : "Edit"}
                    </button>
                    <DeleteButton kind="asset_payment" id={p.id} />
                  </div>
                </div>
                {p.note ? <p className="mt-1 text-xs text-slate-500">{p.note}</p> : null}
                {editingId === p.id ? (
                  <PaymentForm asset={asset} payment={p} onDone={() => setEditingId(null)} />
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
