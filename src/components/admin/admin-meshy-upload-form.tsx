"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createGeneration } from "@/actions/admin-meshy";
import { MESHY_SOURCE_IMAGE_MAX_BYTES as MAX_PHOTO_BYTES } from "@/lib/meshy/types";
import { BRAND } from "@/lib/brand";

/**
 * Phase 21 (21-06) — Meshy generation upload form.
 *
 * Structurally mirrors `dispute-evidence-uploader.tsx`: controlled
 * `useState` per field + `useTransition` + a `useRef` file input + a
 * client-side guard mirroring the server-side check in `createGeneration`
 * (21-03) + FormData submit + an inline red error banner (not a toast).
 */
export function AdminMeshyUploadForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  function revokePreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError(null);

    if (picked.type !== "image/jpeg" && picked.type !== "image/png") {
      setError("Photo must be JPEG or PNG");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (picked.size > MAX_PHOTO_BYTES) {
      setError("Photo exceeds 10MB");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    revokePreview();
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Photo is required.");
      return;
    }

    const fd = new FormData();
    fd.set("photo", file, file.name);
    fd.set("texture_prompt", prompt);

    startTransition(async () => {
      const r = await createGeneration(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/admin/meshy/${r.id}`);
    });
  }

  const inputClass =
    "w-full min-h-[48px] rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium mb-1">Reference photo</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={onPick}
          disabled={pending}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-slate-400 disabled:opacity-50"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Reference photo preview"
              className="h-40 w-40 rounded-xl object-cover"
              style={{ width: 160, height: 160 }}
            />
          ) : (
            <span className="text-sm font-medium text-slate-600">
              Click to choose a JPEG or PNG photo
            </span>
          )}
          <span className="text-xs text-slate-500">
            {file ? file.name : "No file selected"}
          </span>
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Best results: single centered subject, plain background, even lighting.
          Busy/cluttered photos often fail to generate.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Style prompt (optional)
        </label>
        <textarea
          className={inputClass}
          rows={3}
          maxLength={600}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={pending}
          placeholder="e.g. matte ceramic finish, warm earth tones..."
        />
        <div className="mt-1 text-right text-xs text-slate-500">
          {prompt.length}/600
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          className="min-h-[48px] px-6 text-white"
          style={{ backgroundColor: BRAND.green }}
          disabled={pending || !file}
        >
          {pending ? (
            <>
              <span
                className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden
              />
              Generating...
            </>
          ) : (
            "Start Generation"
          )}
        </Button>
      </div>
    </form>
  );
}
