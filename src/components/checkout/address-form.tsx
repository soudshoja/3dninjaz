"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { orderAddressSchema, MALAYSIAN_STATES } from "@/lib/validators";
import { BRAND } from "@/lib/brand";
import { AddressPicker } from "@/components/checkout/address-picker";
import type { SavedAddress } from "@/actions/addresses";

// Output type (what Zod produces after parsing — country is "Malaysia", not
// optional) is the contract the rest of the app consumes.
export type AddressFormValues = z.output<typeof orderAddressSchema>;
// Input type — what react-hook-form tracks internally. Optional fields are
// allowed to be undefined before validation runs. Using this avoids a Resolver
// type mismatch between the schema's input and output shapes.
type AddressFormInput = z.input<typeof orderAddressSchema>;

// Adapter — map saved address book entry (06-03 schema) to the orderAddressSchema
// shape used by createPayPalOrder. Field names differ (fullName vs recipientName,
// line1 vs addressLine1) so we explicitly translate.
function adaptSaved(a: SavedAddress): AddressFormValues {
  return {
    recipientName: a.fullName,
    phone: a.phone,
    addressLine1: a.line1,
    addressLine2: a.line2 ?? "",
    city: a.city,
    state: a.state as AddressFormValues["state"],
    postcode: a.postcode,
    country: "Malaysia",
  };
}

// Human-readable field names for the summary banner
const FIELD_LABELS: Record<string, string> = {
  recipientName: "Recipient name",
  phone: "Phone number",
  addressLine1: "Address line 1",
  city: "City",
  state: "State",
  postcode: "Postcode",
};

// Required field keys (addressLine2 and country are not required from user)
const REQUIRED_FIELDS = [
  "recipientName",
  "phone",
  "addressLine1",
  "city",
  "state",
  "postcode",
] as const;

/**
 * Shipping address form (D3-05) — react-hook-form + zodResolver bound to
 * orderAddressSchema. Emits the validated values up to the parent via
 * onValidChange; null when the form is invalid. The parent uses that to
 * enable/disable the PayPal button.
 *
 * Phase 6 06-03 extension: when `savedAddresses` is provided and non-empty,
 * an AddressPicker renders above the form. The default address is auto-
 * selected; the inline form is hidden in "saved" mode and revealed when the
 * user picks "Use a new address". Zero-saved case: picker returns null and
 * the form behaves exactly as in Phase 3 03-02 (T-06-03-regression).
 *
 * Tap targets: all inputs meet the ≥48px minimum (D3-20) via min-h-[48px]
 * + py-3 + px-4.
 *
 * UX fix: per-field red border + error message on touch/submit-attempt,
 * required asterisks on all required fields, summary banner when errors exist.
 */
export function AddressForm({
  defaultName,
  onValidChange,
  savedAddresses,
}: {
  defaultName: string;
  onValidChange: (v: AddressFormValues | null) => void;
  savedAddresses?: SavedAddress[];
}) {
  const hasSaved = !!savedAddresses && savedAddresses.length > 0;
  const [mode, setMode] = useState<"saved" | "new">(hasSaved ? "saved" : "new");
  const [pickedAddress, setPickedAddress] = useState<AddressFormValues | null>(
    hasSaved ? adaptSaved(savedAddresses[0]) : null,
  );

  // Track whether the user has attempted to submit / has touched any field so
  // we know when to surface the summary banner.
  const [formAttempted, setFormAttempted] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  const { register, formState, watch, trigger } = useForm<
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
  const errors = formState.errors;
  const touchedFields = formState.touchedFields;

  // Determine whether any required field has been touched — used to gate banner
  const anyTouched = REQUIRED_FIELDS.some((f) => touchedFields[f]);
  const showBanner = (formAttempted || anyTouched) && Object.keys(errors).length > 0;

  // Fields with active errors that user has touched OR form was attempted
  const erroredFields = REQUIRED_FIELDS.filter(
    (f) => errors[f] && (formAttempted || touchedFields[f]),
  );

  useEffect(() => {
    if (mode === "saved") {
      onValidChange(pickedAddress);
      return;
    }
    onValidChange(valid ? (values as AddressFormValues) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    pickedAddress,
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

  // When the form is not valid and the user clicks anywhere outside a field
  // (blur on the form element), mark as attempted so all errors surface.
  function handleFormBlur() {
    if (!valid && anyTouched) {
      setFormAttempted(true);
    }
  }

  // Trigger full validation on demand (called when user tries to proceed while
  // form is still shown — parent can call this via ref if needed, but we also
  // trigger internally on any submit attempt).
  function handleFormClick() {
    if (!valid) {
      setFormAttempted(true);
      void trigger();
    }
  }

  // Shared input classes — 48px min target (D3-20)
  const inputBase =
    "w-full rounded-xl border-2 px-4 py-3 min-h-[48px] focus:outline-none focus:ring-2 bg-white transition-colors";

  // Return correct border + ring classes based on error state.
  // NOTE: we use inline style only for the normal (no-error) state because
  // BRAND.ink is a runtime value. For error state we use Tailwind classes so
  // they take precedence (inline styles would override Tailwind).
  type FormFieldName = keyof Pick<AddressFormInput, "recipientName" | "phone" | "addressLine1" | "addressLine2" | "city" | "state" | "postcode" | "country">;
  function fieldClasses(fieldName: FormFieldName, isSelect = false) {
    const hasError =
      !!errors[fieldName] && (formAttempted || !!touchedFields[fieldName]);
    if (hasError) {
      return `${inputBase} border-red-500 focus:ring-red-300 bg-red-50${isSelect ? " text-gray-900" : ""}`;
    }
    return inputBase;
  }

  function fieldStyle(fieldName: FormFieldName) {
    const hasError =
      !!errors[fieldName] && (formAttempted || !!touchedFields[fieldName]);
    // Only apply the subtle ink border when there is no error; let Tailwind
    // handle the red border so it isn't overridden.
    return hasError ? {} : { borderColor: `${BRAND.ink}22` };
  }

  // Required asterisk helper
  const Req = () => (
    <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
  );

  return (
    <form
      className="grid gap-4"
      noValidate
      onBlur={handleFormBlur}
      onClick={handleFormClick}
    >
      {/* Summary banner — renders when errors exist after touch/attempt */}
      {showBanner && erroredFields.length > 0 && (
        <div
          ref={bannerRef}
          role="alert"
          className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-semibold mb-1">Almost there — please fix:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {erroredFields.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-red-900 focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    const el = document.getElementById(`field-${f}`);
                    el?.focus();
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {FIELD_LABELS[f]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasSaved && savedAddresses ? (
        <AddressPicker
          addresses={savedAddresses}
          onSelect={(a) => {
            setMode("saved");
            setPickedAddress(adaptSaved(a));
          }}
          onUseNew={() => {
            setMode("new");
            setPickedAddress(null);
          }}
        />
      ) : null}

      <div className={mode === "saved" ? "hidden" : "contents"}>
        <div>
          <label htmlFor="field-recipientName" className="block text-sm font-semibold mb-1">
            Recipient name<Req />
          </label>
          <input
            id="field-recipientName"
            aria-invalid={!!errors.recipientName}
            aria-describedby={errors.recipientName && (formAttempted || touchedFields.recipientName) ? "err-recipientName" : undefined}
            className={fieldClasses("recipientName")}
            style={fieldStyle("recipientName")}
            autoComplete="name"
            {...register("recipientName")}
          />
          {errors.recipientName && (formAttempted || touchedFields.recipientName) ? (
            <p id="err-recipientName" className="text-xs text-red-600 mt-1" role="alert">
              {errors.recipientName.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="field-phone" className="block text-sm font-semibold mb-1">
            Phone (Malaysia)<Req />
          </label>
          <input
            id="field-phone"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone && (formAttempted || touchedFields.phone) ? "err-phone" : undefined}
            className={fieldClasses("phone")}
            style={fieldStyle("phone")}
            placeholder="+60 12 345 6789"
            {...register("phone")}
          />
          {errors.phone && (formAttempted || touchedFields.phone) ? (
            <p id="err-phone" className="text-xs text-red-600 mt-1" role="alert">
              {errors.phone.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="field-addressLine1" className="block text-sm font-semibold mb-1">
            Address line 1<Req />
          </label>
          <input
            id="field-addressLine1"
            aria-invalid={!!errors.addressLine1}
            aria-describedby={errors.addressLine1 && (formAttempted || touchedFields.addressLine1) ? "err-addressLine1" : undefined}
            className={fieldClasses("addressLine1")}
            style={fieldStyle("addressLine1")}
            autoComplete="address-line1"
            {...register("addressLine1")}
          />
          {errors.addressLine1 && (formAttempted || touchedFields.addressLine1) ? (
            <p id="err-addressLine1" className="text-xs text-red-600 mt-1" role="alert">
              {errors.addressLine1.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="field-addressLine2" className="block text-sm font-semibold mb-1">
            Address line 2{" "}
            <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="field-addressLine2"
            className={inputBase}
            style={{ borderColor: `${BRAND.ink}22` }}
            autoComplete="address-line2"
            {...register("addressLine2")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="field-city" className="block text-sm font-semibold mb-1">
              City<Req />
            </label>
            <input
              id="field-city"
              aria-invalid={!!errors.city}
              aria-describedby={errors.city && (formAttempted || touchedFields.city) ? "err-city" : undefined}
              className={fieldClasses("city")}
              style={fieldStyle("city")}
              autoComplete="address-level2"
              {...register("city")}
            />
            {errors.city && (formAttempted || touchedFields.city) ? (
              <p id="err-city" className="text-xs text-red-600 mt-1" role="alert">
                {errors.city.message}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="field-postcode" className="block text-sm font-semibold mb-1">
              Postcode<Req />
            </label>
            <input
              id="field-postcode"
              inputMode="numeric"
              maxLength={5}
              aria-invalid={!!errors.postcode}
              aria-describedby={errors.postcode && (formAttempted || touchedFields.postcode) ? "err-postcode" : undefined}
              className={fieldClasses("postcode")}
              style={fieldStyle("postcode")}
              autoComplete="postal-code"
              placeholder="50450"
              {...register("postcode")}
            />
            {errors.postcode && (formAttempted || touchedFields.postcode) ? (
              <p id="err-postcode" className="text-xs text-red-600 mt-1" role="alert">
                {errors.postcode.message}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="field-state" className="block text-sm font-semibold mb-1">
            State<Req />
          </label>
          <select
            id="field-state"
            aria-invalid={!!errors.state}
            aria-describedby={errors.state && (formAttempted || touchedFields.state) ? "err-state" : undefined}
            className={fieldClasses("state", true)}
            style={fieldStyle("state")}
            defaultValue=""
            {...register("state")}
          >
            <option value="" disabled className="text-slate-400">
              Required — please select your state
            </option>
            {MALAYSIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {errors.state && (formAttempted || touchedFields.state) ? (
            <p id="err-state" className="text-xs text-red-600 mt-1" role="alert">
              {errors.state.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="field-country" className="block text-sm font-semibold mb-1">
            Country
          </label>
          <input
            id="field-country"
            className={inputBase + " bg-slate-100 cursor-not-allowed"}
            style={{ borderColor: `${BRAND.ink}22` }}
            readOnly
            {...register("country")}
          />
        </div>
      </div>
    </form>
  );
}
