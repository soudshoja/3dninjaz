"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { updateUserNotes, updateUserTags } from "@/actions/admin-user-detail";

const MAX_NOTES = 5000;

// ============================================================================
// NotesEditor — autosave on blur
// ============================================================================

export function NotesEditor({
  userId,
  initialNotes,
}: {
  userId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setStatus("saving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateUserNotes(userId, value.length > 0 ? value : null);
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2500);
      } else {
        setStatus("error");
        setErrorMsg(res.error);
      }
    });
  };

  return (
    <div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value.slice(0, MAX_NOTES));
            if (status === "saved") setStatus("idle");
          }}
          onBlur={save}
          rows={5}
          maxLength={MAX_NOTES}
          placeholder="Internal admin notes about this customer…"
          className="w-full rounded-xl border-2 px-3 py-2 text-sm resize-y"
          style={{
            borderColor: `${BRAND.ink}33`,
            color: BRAND.ink,
            backgroundColor: "#fff",
          }}
          disabled={pending}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {value.length}/{MAX_NOTES}
        </span>
        <span
          className="font-semibold"
          style={{
            color:
              status === "saved"
                ? BRAND.green
                : status === "error"
                  ? "#dc2626"
                  : status === "saving"
                    ? BRAND.blue
                    : "transparent",
          }}
        >
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved ✓"
              : status === "error"
                ? (errorMsg ?? "Error")
                : "·"}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// TagsEditor — chip input
// ============================================================================

export function TagsEditor({
  userId,
  initialTags,
}: {
  userId: string;
  initialTags: string[];
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const persist = (next: string[]) => {
    startTransition(async () => {
      await updateUserTags(userId, next);
    });
  };

  const addTag = (raw: string) => {
    const entries = raw
      .split(",")
      .map((t) => t.trim().toLowerCase().slice(0, 32))
      .filter((t) => t.length > 0);
    const next = Array.from(new Set([...tags, ...entries])).slice(0, 10);
    setTags(next);
    setInput("");
    persist(next);
  };

  const removeTag = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    persist(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div>
      <div
        className="flex flex-wrap gap-2 rounded-xl border-2 px-3 py-2 min-h-[48px] items-center cursor-text"
        style={{ borderColor: `${BRAND.ink}33`, backgroundColor: "#fff" }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{ borderColor: `${BRAND.ink}66`, color: BRAND.ink, backgroundColor: `${BRAND.ink}08` }}
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              disabled={pending}
              className="rounded-full hover:opacity-60 transition-opacity disabled:opacity-30"
              style={{ color: BRAND.ink }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (input.trim()) addTag(input);
          }}
          disabled={pending || tags.length >= 10}
          placeholder={tags.length === 0 ? "Add tags… (Enter or comma)" : tags.length >= 10 ? "Max 10 tags" : ""}
          className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
          style={{ color: BRAND.ink }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Press Enter or comma to add. {tags.length}/10 tags.
      </p>
    </div>
  );
}

// ============================================================================
// InlineSuspendButton — reuses the existing suspend/unsuspend actions
// ============================================================================

import { suspendUser, unsuspendUser } from "@/actions/admin-users";

export function InlineSuspendButton({
  userId,
  banned,
  banReason,
  userName,
}: {
  userId: string;
  banned: boolean;
  banReason: string | null;
  userName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSuspend = () => {
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
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
    startTransition(async () => {
      const res = await unsuspendUser(userId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  if (banned) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{ backgroundColor: "#dc2626" }}
        >
          Suspended
        </span>
        {banReason ? (
          <span className="text-xs text-slate-500">{banReason}</span>
        ) : null}
        <button
          type="button"
          onClick={onUnsuspend}
          disabled={pending}
          className="rounded-full px-4 text-sm font-semibold text-white min-h-[40px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.green }}
        >
          {pending ? "Unsuspending…" : "Unsuspend"}
        </button>
        {error ? (
          <p className="text-xs" style={{ color: "#dc2626" }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDialog(true)}
        disabled={pending}
        className="inline-flex items-center rounded-full border-2 px-4 text-sm font-semibold min-h-[40px] disabled:opacity-50"
        style={{ borderColor: "#dc2626", color: "#dc2626" }}
      >
        Suspend
      </button>
      {showDialog ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inline-suspend-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6"
            style={{ color: BRAND.ink }}
          >
            <h2
              id="inline-suspend-title"
              className="font-[var(--font-heading)] text-xl mb-2"
            >
              Suspend {userName}?
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              The user will be unable to sign in until you unsuspend them.
            </p>
            <label
              htmlFor="inline-suspend-reason"
              className="block text-sm font-semibold mb-1"
            >
              Reason (optional, internal)
            </label>
            <textarea
              id="inline-suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{ borderColor: `${BRAND.ink}33` }}
              placeholder="e.g. spam orders"
            />
            {error ? (
              <p role="alert" className="mt-2 text-sm" style={{ color: "#dc2626" }}>
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setShowDialog(false); setError(null); }}
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
