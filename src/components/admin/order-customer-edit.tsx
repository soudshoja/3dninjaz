"use client";

/**
 * OrderCustomerEdit — inline form to edit customer + ship-to details on an
 * unpaid order. Only rendered when isOrderEditable() is true on the server.
 *
 * Mirrors the pending/success/error pattern from RefreshShippingButton.
 * On success calls router.refresh() so the page re-renders with updated data
 * (revalidatePath is called inside updateOrderCustomer).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { updateOrderCustomer } from "@/actions/admin-order-edit";
import { MALAYSIAN_STATES } from "@/lib/validators";

type InitialValues = {
  shippingName: string;
  customerEmail: string;
  shippingPhone: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPostcode: string;
};

type Props = {
  orderId: string;
  initial: InitialValues;
};

export function OrderCustomerEdit({ orderId, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [values, setValues] = useState<InitialValues>({
    shippingName: initial.shippingName,
    customerEmail: initial.customerEmail,
    shippingPhone: initial.shippingPhone,
    shippingLine1: initial.shippingLine1,
    shippingLine2: initial.shippingLine2 ?? "",
    shippingCity: initial.shippingCity,
    shippingState: initial.shippingState,
    shippingPostcode: initial.shippingPostcode,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setSuccessMsg(null);
    setErrorMsg(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateOrderCustomer(orderId, {
        shippingName: values.shippingName,
        customerEmail: values.customerEmail,
        shippingPhone: values.shippingPhone,
        shippingLine1: values.shippingLine1,
        shippingLine2: values.shippingLine2 || undefined,
        shippingCity: values.shippingCity,
        shippingState: values.shippingState,
        shippingPostcode: values.shippingPostcode,
      });
      if (res.ok) {
        setSuccessMsg("Customer details updated.");
        router.refresh();
      } else {
        setErrorMsg(res.error);
      }
    });
  }

  const inputCls =
    "w-full rounded-xl border px-3 py-2 text-sm font-medium outline-none transition-colors focus:ring-2";
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

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-2xl p-4"
      style={{
        backgroundColor: `${BRAND.blue}06`,
        border: `1.5px solid ${BRAND.blue}20`,
      }}
    >
      <p
        className="text-xs font-bold uppercase tracking-wider mb-4"
        style={{ color: BRAND.blue }}
      >
        Edit customer &amp; ship-to
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Recipient name */}
        <div>
          <label htmlFor="oc-shippingName" style={labelStyle}>
            Recipient name
          </label>
          <input
            id="oc-shippingName"
            name="shippingName"
            type="text"
            value={values.shippingName}
            onChange={handleChange}
            className={inputCls}
            style={inputStyle}
            required
            maxLength={200}
            autoComplete="off"
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="oc-shippingPhone" style={labelStyle}>
            Phone
          </label>
          <input
            id="oc-shippingPhone"
            name="shippingPhone"
            type="text"
            value={values.shippingPhone}
            onChange={handleChange}
            className={inputCls}
            style={inputStyle}
            required
            maxLength={30}
            autoComplete="off"
          />
        </div>

        {/* Email */}
        <div className="sm:col-span-2">
          <label htmlFor="oc-customerEmail" style={labelStyle}>
            Email (leave blank to keep existing)
          </label>
          <input
            id="oc-customerEmail"
            name="customerEmail"
            type="email"
            value={values.customerEmail}
            onChange={handleChange}
            className={inputCls}
            style={inputStyle}
            maxLength={255}
            autoComplete="off"
          />
        </div>

        {/* Address line 1 */}
        <div className="sm:col-span-2">
          <label htmlFor="oc-shippingLine1" style={labelStyle}>
            Address line 1
          </label>
          <input
            id="oc-shippingLine1"
            name="shippingLine1"
            type="text"
            value={values.shippingLine1}
            onChange={handleChange}
            className={inputCls}
            style={inputStyle}
            required
            maxLength={255}
            autoComplete="off"
          />
        </div>

        {/* Address line 2 */}
        <div className="sm:col-span-2">
          <label htmlFor="oc-shippingLine2" style={labelStyle}>
            Address line 2 (optional)
          </label>
          <input
            id="oc-shippingLine2"
            name="shippingLine2"
            type="text"
            value={values.shippingLine2 ?? ""}
            onChange={handleChange}
            className={inputCls}
            style={inputStyle}
            maxLength={255}
            autoComplete="off"
          />
        </div>

        {/* City */}
        <div>
          <label htmlFor="oc-shippingCity" style={labelStyle}>
            City
          </label>
          <input
            id="oc-shippingCity"
            name="shippingCity"
            type="text"
            value={values.shippingCity}
            onChange={handleChange}
            className={inputCls}
            style={inputStyle}
            required
            maxLength={100}
            autoComplete="off"
          />
        </div>

        {/* Postcode */}
        <div>
          <label htmlFor="oc-shippingPostcode" style={labelStyle}>
            Postcode (5 digits)
          </label>
          <input
            id="oc-shippingPostcode"
            name="shippingPostcode"
            type="text"
            value={values.shippingPostcode}
            onChange={handleChange}
            className={inputCls}
            style={inputStyle}
            required
            maxLength={5}
            pattern="\d{5}"
            autoComplete="off"
          />
        </div>

        {/* State */}
        <div className="sm:col-span-2">
          <label htmlFor="oc-shippingState" style={labelStyle}>
            State
          </label>
          <select
            id="oc-shippingState"
            name="shippingState"
            value={values.shippingState}
            onChange={handleChange}
            className={inputCls}
            style={inputStyle}
            required
          >
            <option value="">Select state…</option>
            {MALAYSIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: BRAND.blue,
            color: "#ffffff",
            minHeight: 40,
          }}
        >
          {pending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} strokeWidth={2.3} />
          )}
          {pending ? "Saving…" : "Save customer details"}
        </button>
      </div>

      {successMsg ? (
        <p className="mt-2 text-sm font-medium" style={{ color: BRAND.greenDark }}>
          {successMsg}
        </p>
      ) : null}
      {errorMsg ? (
        <p className="mt-2 text-sm" style={{ color: "#be123c" }}>
          {errorMsg}
        </p>
      ) : null}
    </form>
  );
}
