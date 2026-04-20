"use client";

import { useState, useTransition } from "react";
import { updateAdminProfile } from "@/actions/admin-profile";
import { BRAND } from "@/lib/brand";

/**
 * Display-name update for /admin/profile. Mirrors customer ProfileForm but
 * trimmed — admins never need address/phone fields here. Calls
 * updateAdminProfile() which re-checks requireAdmin() server-side.
 */
export function AdminProfileForm({
  initialName,
}: {
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        setStatus({ type: "error", message: "Name is required." });
        return;
      }
      const res = await updateAdminProfile({ name: trimmed });
      if (res.ok) {
        setStatus({ type: "success", message: res.message });
      } else {
        setStatus({ type: "error", message: res.error });
      }
    });
  }

  const inputBase =
    "w-full rounded-xl border-2 px-4 py-3 min-h-[48px] focus:outline-none focus:ring-2 bg-white";
  const borderStyle = { borderColor: `${BRAND.ink}22` };

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div>
        <label
          className="block text-sm font-semibold mb-1"
          htmlFor="admin-name"
        >
          Display name
        </label>
        <input
          id="admin-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputBase}
          style={borderStyle}
          maxLength={200}
          autoComplete="name"
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending}
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
