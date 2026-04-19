"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileUpdateSchema, type ProfileUpdateInput } from "@/lib/validators";
import { updateProfile } from "@/actions/account";
import { BRAND } from "@/lib/brand";

/**
 * Display-name edit form. Email is read-only here; CUST-02 separates the
 * email change into the dedicated /account/security flow with verification.
 */
export function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { name: initialName },
  });
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const onSubmit = handleSubmit((values) => {
    setStatus(null);
    startTransition(async () => {
      const res = await updateProfile(values);
      if (res.ok) {
        setStatus({ type: "success", message: res.message });
      } else {
        setStatus({ type: "error", message: res.error });
      }
    });
  });

  const inputBase =
    "w-full rounded-xl border-2 px-4 py-3 min-h-[48px] focus:outline-none focus:ring-2 bg-white";
  const borderStyle = { borderColor: `${BRAND.ink}22` };

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="profile-name">
          Display name
        </label>
        <input
          id="profile-name"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.name}
          className={inputBase}
          style={borderStyle}
          {...register("name")}
        />
        {errors.name ? (
          <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>
        ) : null}
      </div>

      <div>
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor="profile-email"
        >
          Email
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            id="profile-email"
            type="email"
            value={email}
            readOnly
            className={`${inputBase} bg-slate-100 cursor-not-allowed flex-1 min-w-0`}
            style={borderStyle}
          />
          <Link
            href="/account/security"
            className="inline-flex items-center justify-center min-h-[48px] px-4 rounded-lg font-bold text-sm underline"
            style={{ color: BRAND.ink }}
          >
            Change
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending || !isDirty}
          className="inline-flex items-center justify-center min-h-[60px] px-6 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {status ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm"
            style={{
              color: status.type === "success" ? "#16a34a" : "#DC2626",
            }}
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
