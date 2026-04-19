"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changeEmailSchema, type ChangeEmailInput } from "@/lib/validators";
import { changeEmail } from "@/actions/account";
import { BRAND } from "@/lib/brand";

/**
 * /account/security ChangeEmailForm — triggers Better Auth's verification
 * flow. The DB email column updates ONLY after the user clicks the link in
 * the new inbox.
 */
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: "", currentPassword: "" },
  });
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const onSubmit = handleSubmit((values) => {
    setStatus(null);
    startTransition(async () => {
      const res = await changeEmail(values);
      if (res.ok) {
        setStatus({ type: "success", message: res.message });
        reset();
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
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor="current-email-display"
        >
          Current email
        </label>
        <input
          id="current-email-display"
          type="email"
          value={currentEmail}
          readOnly
          className={`${inputBase} bg-slate-100 cursor-not-allowed`}
          style={borderStyle}
        />
      </div>

      <div>
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor="new-email"
        >
          New email
        </label>
        <input
          id="new-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.newEmail}
          className={inputBase}
          style={borderStyle}
          {...register("newEmail")}
        />
        {errors.newEmail ? (
          <p className="text-xs text-red-600 mt-1">
            {errors.newEmail.message}
          </p>
        ) : null}
      </div>

      <div>
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor="current-password-email"
        >
          Current password
        </label>
        <input
          id="current-password-email"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          className={inputBase}
          style={borderStyle}
          {...register("currentPassword")}
        />
        {errors.currentPassword ? (
          <p className="text-xs text-red-600 mt-1">
            {errors.currentPassword.message}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center min-h-[60px] px-6 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
        >
          {pending ? "Sending…" : "Send verification email"}
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
