"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { orderAddressSchema, MALAYSIAN_STATES } from "@/lib/validators";
import { BRAND } from "@/lib/brand";

// Output type (what Zod produces after parsing — country is "Malaysia", not
// optional) is the contract the rest of the app consumes.
export type AddressFormValues = z.output<typeof orderAddressSchema>;
// Input type — what react-hook-form tracks internally. Optional fields are
// allowed to be undefined before validation runs. Using this avoids a Resolver
// type mismatch between the schema's input and output shapes.
type AddressFormInput = z.input<typeof orderAddressSchema>;

/**
 * Shipping address form (D3-05) — react-hook-form + zodResolver bound to
 * orderAddressSchema. Emits the validated values up to the parent via
 * onValidChange; null when the form is invalid. The parent uses that to
 * enable/disable the PayPal button.
 *
 * Tap targets: all inputs meet the ≥48px minimum (D3-20) via min-h-[48px]
 * + py-3 + px-4.
 */
export function AddressForm({
  defaultName,
  onValidChange,
}: {
  defaultName: string;
  onValidChange: (v: AddressFormValues | null) => void;
}) {
  const { register, formState, watch } = useForm<
    AddressFormInput,
    unknown,
    AddressFormValues
  >({
    resolver: zodResolver(orderAddressSchema),
    mode: "onChange",
    defaultValues: {
      recipientName: defaultName,
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      // state: leave undefined so the empty placeholder option is selected
      postcode: "",
      country: "Malaysia",
    },
  });

  const values = watch();
  const valid = formState.isValid;

  useEffect(() => {
    onValidChange(valid ? (values as AddressFormValues) : null);
    // Intentionally watch all field values via `watch()`; re-run on any change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    valid,
    values.recipientName,
    values.phone,
    values.addressLine1,
    values.addressLine2,
    values.city,
    values.state,
    values.postcode,
    values.country,
  ]);

  // Shared input classes — 48px min target (D3-20)
  const inputBase =
    "w-full rounded-xl border-2 px-4 py-3 min-h-[48px] focus:outline-none focus:ring-2 bg-white";
  const borderStyle = { borderColor: `${BRAND.ink}22` };

  return (
    <form className="grid gap-4" noValidate>
      <div>
        <label className="block text-sm font-semibold mb-1">
          Recipient name
        </label>
        <input
          aria-invalid={!!formState.errors.recipientName}
          className={inputBase}
          style={borderStyle}
          autoComplete="name"
          {...register("recipientName")}
        />
        {formState.errors.recipientName ? (
          <p className="text-xs text-red-600 mt-1">
            {formState.errors.recipientName.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">
          Phone (Malaysia)
        </label>
        <input
          inputMode="tel"
          autoComplete="tel"
          aria-invalid={!!formState.errors.phone}
          className={inputBase}
          style={borderStyle}
          placeholder="+60 12 345 6789"
          {...register("phone")}
        />
        {formState.errors.phone ? (
          <p className="text-xs text-red-600 mt-1">
            {formState.errors.phone.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">
          Address line 1
        </label>
        <input
          aria-invalid={!!formState.errors.addressLine1}
          className={inputBase}
          style={borderStyle}
          autoComplete="address-line1"
          {...register("addressLine1")}
        />
        {formState.errors.addressLine1 ? (
          <p className="text-xs text-red-600 mt-1">
            {formState.errors.addressLine1.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">
          Address line 2{" "}
          <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          className={inputBase}
          style={borderStyle}
          autoComplete="address-line2"
          {...register("addressLine2")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold mb-1">City</label>
          <input
            aria-invalid={!!formState.errors.city}
            className={inputBase}
            style={borderStyle}
            autoComplete="address-level2"
            {...register("city")}
          />
          {formState.errors.city ? (
            <p className="text-xs text-red-600 mt-1">
              {formState.errors.city.message}
            </p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Postcode</label>
          <input
            inputMode="numeric"
            maxLength={5}
            aria-invalid={!!formState.errors.postcode}
            className={inputBase}
            style={borderStyle}
            autoComplete="postal-code"
            placeholder="50450"
            {...register("postcode")}
          />
          {formState.errors.postcode ? (
            <p className="text-xs text-red-600 mt-1">
              {formState.errors.postcode.message}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">State</label>
        <select
          aria-invalid={!!formState.errors.state}
          className={inputBase}
          style={borderStyle}
          defaultValue=""
          {...register("state")}
        >
          <option value="" disabled>
            Select a state…
          </option>
          {MALAYSIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {formState.errors.state ? (
          <p className="text-xs text-red-600 mt-1">
            {formState.errors.state.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Country</label>
        <input
          className={inputBase + " bg-slate-100 cursor-not-allowed"}
          style={borderStyle}
          readOnly
          {...register("country")}
        />
      </div>
    </form>
  );
}
