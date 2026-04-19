"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { suspendUser, unsuspendUser } from "@/actions/admin-users";

type RowUser = {
  id: string;
  name: string;
  email: string;
  banned: boolean;
  banReason: string | null;
};

/**
 * /admin/users row action menu. Renders Suspend / Unsuspend buttons + a
 * small confirmation dialog with an optional reason textarea on suspend.
 *
 * Uses a barebones dialog (no @radix-ui/react-dialog wrapper) to keep the
 * client bundle small — only one input on a confirm screen.
 *
 * D-04: every interactive element ≥ 48px tap target.
 */
export function UserRowActions({ user }: { user: RowUser }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSuspend = () => {
    setError(null);
    const fd = new FormData();
    fd.set("userId", user.id);
    fd.set("suspend", "true");
    if (reason.trim()) fd.set("reason", reason.trim());
    startTransition(async () => {
      const res = await suspendUser(fd);
      if (res.ok) {
        setShowDialog(false);
        setReason("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const onUnsuspend = () => {
    setError(null);
    startTransition(async () => {
      const res = await unsuspendUser(user.id);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  if (!user.banned) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowDialog(true)}
          disabled={pending}
          className="inline-flex items-center rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap min-h-[48px] disabled:opacity-50"
          style={{ borderColor: "#dc2626", color: "#dc2626" }}
        >
          Suspend
        </button>
        {showDialog ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="suspend-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6"
              style={{ color: BRAND.ink }}
            >
              <h2
                id="suspend-title"
                className="font-[var(--font-heading)] text-xl mb-2"
              >
                Suspend {user.name || user.email}?
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                The user will be unable to sign in until you unsuspend them.
                In-flight sessions persist until their next request.
              </p>
              <label
                htmlFor="suspend-reason"
                className="block text-sm font-semibold mb-1"
              >
                Reason (optional, internal)
              </label>
              <textarea
                id="suspend-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                className="w-full rounded-xl border-2 px-3 py-2 text-sm"
                style={{ borderColor: `${BRAND.ink}33` }}
                placeholder="e.g. spam orders, chargebacks"
              />
              {error ? (
                <p
                  role="alert"
                  className="mt-2 text-sm"
                  style={{ color: "#dc2626" }}
                >
                  {error}
                </p>
              ) : null}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowDialog(false);
                    setError(null);
                  }}
                  disabled={pending}
                  className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
                  style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSuspend}
                  disabled={pending}
                  className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
                  style={{ backgroundColor: "#dc2626" }}
                >
                  {pending ? "Suspending…" : "Suspend"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onUnsuspend}
        disabled={pending}
        className="inline-flex items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap min-h-[48px] text-white disabled:opacity-50"
        style={{ backgroundColor: BRAND.green }}
      >
        {pending ? "Unsuspending…" : "Unsuspend"}
      </button>
      {user.banReason ? (
        <p className="text-xs text-slate-500 max-w-[200px] truncate">
          {user.banReason}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
