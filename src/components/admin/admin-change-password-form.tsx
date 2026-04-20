"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validators";
import { changeAdminPassword } from "@/actions/admin-profile";
import { BRAND } from "@/lib/brand";

/**
 * Admin password change form. Adapted from the customer-side
 * ChangePasswordForm (Phase 6 06-02) — same Better Auth challenge, same
 * confirmNewPassword UX safeguard, but the server action is gated by
 * requireAdmin() instead of requireUser().
 */
export function AdminChangePasswordForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });
  const newPassword = watch("newPassword");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setStatus(null);
    setConfirmError(null);
    if (values.newPassword !== confirmNewPassword) {
      setConfirmError("Passwords do not match.");
      return;
    }
    startTransition(async () => {
      const res = await changeAdminPassword(values);
      if (res.ok) {
        setStatus({ type: "success", message: res.message });
        reset();
        setConfirmNewPassword("");
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
          htmlFor="admin-current-password"
        >
          Current password
        </label>
        <input
          id="admin-current-password"
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

      <div>
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor="admin-new-password"
        >
          New password
        </label>
        <input
          id="admin-new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          className={inputBase}
          style={borderStyle}
          aria-describedby="admin-new-password-hint"
          {...register("newPassword")}
        />
        <p id="admin-new-password-hint" className="text-xs text-slate-600 mt-1">
          At least 8 characters, different from current password.
        </p>
        {errors.newPassword ? (
          <p className="text-xs text-red-600 mt-1">
            {errors.newPassword.message}
          </p>
        ) : null}
      </div>

      <div>
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor="admin-confirm-new-password"
        >
          Confirm new password
        </label>
        <input
          id="admin-confirm-new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!confirmError}
          className={inputBase}
          style={borderStyle}
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
        />
        {confirmError ? (
          <p className="text-xs text-red-600 mt-1">{confirmError}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending || !newPassword}
          className="inline-flex items-center justify-center min-h-[60px] px-6 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
        >
          {pending ? "Updating…" : "Update password"}
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
