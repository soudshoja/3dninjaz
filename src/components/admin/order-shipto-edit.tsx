"use client";

/**
 * OrderShipToEdit — inline editor for an order's ship-to / recipient details
 * (recipient name, phone, full Malaysian address). Rendered in the Ship-to card
 * on the admin order detail page.
 *
 * NOT gated by payment/fulfilment status — admins correct addresses on shipped /
 * manual orders so a rebooked courier label carries the right destination.
 * On success calls router.refresh() (the action revalidates the page).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Loader2, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { updateOrderShipTo } from "@/actions/admin-orders";
import { MALAYSIAN_STATES } from "@/lib/validators";

type Initial = {
  shippingName: string;
  shippingPhone: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPostcode: string;
};

export function OrderShipToEdit({
  orderId,
  initial,
}: {
  orderId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [values, setValues] = useState({
    shippingName: initial.shippingName,
    shippingPhone: initial.shippingPhone,
    shippingLine1: initial.shippingLine1,
    shippingLine2: initial.shippingLine2 ?? "",
    shippingCity: initial.shippingCity,
    shippingState: initial.shippingState,
    shippingPostcode: initial.shippingPostcode,
  });

  function onChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setValues((p) => ({ ...p, [name]: value }));
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await updateOrderShipTo(orderId, {
        shippingName: values.shippingName,
        shippingPhone: values.shippingPhone,
        shippingLine1: values.shippingLine1,
        shippingLine2: values.shippingLine2 || undefined,
        shippingCity: values.shippingCity,
        shippingState: values.shippingState,
        shippingPostcode: values.shippingPostcode,
      });
      if (res.ok) {
        setSuccessMsg("Ship-to updated. Rebook the courier to print a corrected label.");
        router.refresh();
      } else {
        setErrorMsg(res.error);
      }
    });
  }

  const inputCls =
    "w-full rounded-xl border px-3 py-2 text-sm font-medium outline-none focus:ring-2";
  const inputStyle = {
    borderColor: `${BRAND.ink}20`,
    backgroundColor: "#ffffff",
    color: BRAND.ink,
  };
  const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{
          color: BRAND.purple,
          backgroundColor: `${BRAND.purple}10`,
          border: `1.5px solid ${BRAND.purple}30`,
        }}
      >
        <Pencil size={14} strokeWidth={2.3} />
        Edit ship-to
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-2xl p-4"
      style={{
        backgroundColor: `${BRAND.purple}06`,
        border: `1.5px solid ${BRAND.purple}20`,
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <p
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: BRAND.purple }}
        >
          Edit ship-to
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 transition-opacity hover:opacity-70"
          style={{ color: "#64748b" }}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="st-name" style={labelStyle}>Recipient name</label>
          <input id="st-name" name="shippingName" type="text" value={values.shippingName}
            onChange={onChange} className={inputCls} style={inputStyle} required maxLength={200} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="st-phone" style={labelStyle}>Phone</label>
          <input id="st-phone" name="shippingPhone" type="text" value={values.shippingPhone}
            onChange={onChange} className={inputCls} style={inputStyle} required maxLength={30} autoComplete="off" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="st-l1" style={labelStyle}>Address line 1</label>
          <input id="st-l1" name="shippingLine1" type="text" value={values.shippingLine1}
            onChange={onChange} className={inputCls} style={inputStyle} required maxLength={255} autoComplete="off" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="st-l2" style={labelStyle}>Address line 2 (optional)</label>
          <input id="st-l2" name="shippingLine2" type="text" value={values.shippingLine2}
            onChange={onChange} className={inputCls} style={inputStyle} maxLength={255} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="st-city" style={labelStyle}>City</label>
          <input id="st-city" name="shippingCity" type="text" value={values.shippingCity}
            onChange={onChange} className={inputCls} style={inputStyle} required maxLength={100} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="st-post" style={labelStyle}>Postcode (5 digits)</label>
          <input id="st-post" name="shippingPostcode" type="text" value={values.shippingPostcode}
            onChange={onChange} className={inputCls} style={inputStyle} required maxLength={5} pattern="\d{5}" autoComplete="off" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="st-state" style={labelStyle}>State</label>
          <select id="st-state" name="shippingState" value={values.shippingState}
            onChange={onChange} className={inputCls} style={inputStyle} required>
            <option value="">Select state…</option>
            {MALAYSIAN_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: BRAND.purple, minHeight: 40 }}>
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2.3} />}
          {pending ? "Saving…" : "Save ship-to"}
        </button>
      </div>

      {successMsg ? (
        <p className="mt-2 text-sm font-medium" style={{ color: BRAND.greenDark }}>{successMsg}</p>
      ) : null}
      {errorMsg ? (
        <p className="mt-2 text-sm" style={{ color: "#be123c" }}>{errorMsg}</p>
      ) : null}
    </form>
  );
}
