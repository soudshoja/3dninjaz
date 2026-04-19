"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  addressBookSchema,
  MALAYSIAN_STATES,
  type AddressBookInput,
} from "@/lib/validators";
import { createAddress, updateAddress } from "@/actions/addresses";
import { BRAND } from "@/lib/brand";

type Mode = "create" | "edit";

// Input type — what react-hook-form tracks before zodResolver fills defaults
// (country, isDefault). Using both Input + Output sides on useForm avoids the
// Resolver type mismatch (Phase 3 03-02 same pattern in checkout/address-form).
type AddressBookFormInput = z.input<typeof addressBookSchema>;
type AddressBookFormOutput = z.output<typeof addressBookSchema>;

export type AddressFormInitial = AddressBookInput & { id: string };

/**
 * Reusable create/edit form for /account/addresses. Uses addressBookSchema
 * for client-side validation; server actions re-validate before persisting.
 *
 * Mode: "create" -> createAddress; "edit" -> updateAddress(id, ...).
 * On success, redirects to /account/addresses (router.push) so the
 * server-rendered list reflects the new state.
 */
export function AddressForm({
  mode,
  initial,
}: {
  mode: Mode;
  initial?: AddressFormInitial;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressBookFormInput, unknown, AddressBookFormOutput>({
    resolver: zodResolver(addressBookSchema),
    defaultValues: initial ?? {
      fullName: "",
      phone: "",
      line1: "",
      line2: "",
      city: "",
      // state intentionally undefined so the placeholder option shows
      postcode: "",
      country: "Malaysia",
      isDefault: false,
    },
  });
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createAddress(values)
          : await updateAddress(initial!.id, values);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      router.push("/account/addresses");
      router.refresh();
    });
  });

  const inputBase =
    "w-full rounded-xl border-2 px-4 py-3 min-h-[48px] focus:outline-none focus:ring-2 bg-white";
  const borderStyle = { borderColor: `${BRAND.ink}22` };

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="addr-fullname">
          Full name
        </label>
        <input
          id="addr-fullname"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.fullName}
          className={inputBase}
          style={borderStyle}
          {...register("fullName")}
        />
        {errors.fullName ? (
          <p className="text-xs text-red-600 mt-1">{errors.fullName.message}</p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="addr-phone">
          Phone (Malaysia)
        </label>
        <input
          id="addr-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+60 12 345 6789"
          aria-invalid={!!errors.phone}
          className={inputBase}
          style={borderStyle}
          {...register("phone")}
        />
        {errors.phone ? (
          <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="addr-line1">
          Address line 1
        </label>
        <input
          id="addr-line1"
          type="text"
          autoComplete="address-line1"
          aria-invalid={!!errors.line1}
          className={inputBase}
          style={borderStyle}
          {...register("line1")}
        />
        {errors.line1 ? (
          <p className="text-xs text-red-600 mt-1">{errors.line1.message}</p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="addr-line2">
          Address line 2{" "}
          <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="addr-line2"
          type="text"
          autoComplete="address-line2"
          className={inputBase}
          style={borderStyle}
          {...register("line2")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold mb-1" htmlFor="addr-city">
            City
          </label>
          <input
            id="addr-city"
            type="text"
            autoComplete="address-level2"
            aria-invalid={!!errors.city}
            className={inputBase}
            style={borderStyle}
            {...register("city")}
          />
          {errors.city ? (
            <p className="text-xs text-red-600 mt-1">{errors.city.message}</p>
          ) : null}
        </div>

        <div>
          <label
            className="block text-sm font-semibold mb-1"
            htmlFor="addr-postcode"
          >
            Postcode
          </label>
          <input
            id="addr-postcode"
            type="text"
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            placeholder="50450"
            aria-invalid={!!errors.postcode}
            className={inputBase}
            style={borderStyle}
            {...register("postcode")}
          />
          {errors.postcode ? (
            <p className="text-xs text-red-600 mt-1">
              {errors.postcode.message}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="addr-state">
          State
        </label>
        <select
          id="addr-state"
          aria-invalid={!!errors.state}
          className={inputBase}
          style={borderStyle}
          defaultValue={initial?.state ?? ""}
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
        {errors.state ? (
          <p className="text-xs text-red-600 mt-1">{errors.state.message}</p>
        ) : null}
      </div>

      <div>
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor="addr-country"
        >
          Country
        </label>
        <input
          id="addr-country"
          type="text"
          readOnly
          className={`${inputBase} bg-slate-100 cursor-not-allowed`}
          style={borderStyle}
          {...register("country")}
        />
      </div>

      <label className="flex items-center gap-3 min-h-[48px] cursor-pointer">
        <input type="checkbox" className="h-5 w-5" {...register("isDefault")} />
        <span className="font-semibold">Set as default shipping address</span>
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center min-h-[60px] px-6 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
        >
          {pending ? "Saving…" : "Save address"}
        </button>
        {serverError ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm"
            style={{ color: "#DC2626" }}
          >
            {serverError}
          </p>
        ) : null}
      </div>
    </form>
  );
}
