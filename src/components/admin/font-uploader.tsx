"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2 } from "lucide-react";

export function FontUploader() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a font file.");
      return;
    }
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    fd.set("displayName", displayName.trim());

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/upload-font", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json()) as { error?: string; familySlug?: string; displayName?: string };
        if (!res.ok || json.error) {
          setError(json.error ?? `Upload failed (HTTP ${res.status})`);
          return;
        }
        setSuccess(`Font "${json.displayName}" uploaded (slug: ${json.familySlug})`);
        setDisplayName("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-brand-border)] bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-[var(--color-brand-text-primary)]">
        Upload a custom font
      </h2>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="font-display-name"
          className="text-xs font-medium text-[var(--color-brand-text-muted)]"
        >
          Display name
        </label>
        <input
          id="font-display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Brand Heading"
          maxLength={64}
          required
          className="h-9 rounded-md border border-[var(--color-brand-border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-blue)]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="font-file"
          className="text-xs font-medium text-[var(--color-brand-text-muted)]"
        >
          Font file (.woff2 or .woff, max 3 MB)
        </label>
        <div
          className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--color-brand-border)] px-4 py-3 text-sm text-[var(--color-brand-text-muted)] hover:border-[var(--color-brand-primary)] hover:bg-[var(--color-brand-surface)]"
          onClick={() => fileRef.current?.click()}
        >
          <UploadCloud className="h-4 w-4 shrink-0" />
          <span>
            {fileRef.current?.files?.[0]?.name ?? "Click to select a .woff2 or .woff file"}
          </span>
        </div>
        <input
          ref={fileRef}
          id="font-file"
          type="file"
          accept=".woff2,.woff"
          className="hidden"
          onChange={() => {
            // Force re-render to show selected filename
            setError(null);
            setSuccess(null);
          }}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600" role="status">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-brand-cta)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </>
        ) : (
          "Upload font"
        )}
      </button>
    </form>
  );
}
