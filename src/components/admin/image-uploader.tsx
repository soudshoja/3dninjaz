"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { UploadCloud, X, Star } from "lucide-react";
import { deleteProductImage } from "@/actions/uploads";
import { Button } from "@/components/ui/button";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_BYTES = 50 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Progress tracking types
// ---------------------------------------------------------------------------

type UploadProgress = {
  fileName: string;
  index: number;
  total: number;
  /** 0-100 — represents the XHR upload phase only. */
  percent: number;
  bytesUploaded: number;
  bytesTotal: number;
  /** True when XHR upload is complete but the server is still processing (Sharp encoding). */
  processing: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload a single FormData payload to the Route Handler using XHR so that
 * `upload.onprogress` fires during the actual byte transfer phase.
 *
 * The returned promise resolves to `{ url }` on success or `{ error }` on
 * failure — the same shape the old Server Action returned.
 */
function uploadWithProgress(
  fd: FormData,
  onProgress: (loaded: number, total: number) => void,
  onUploaded: () => void,
): Promise<{ url?: string; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/upload-image");

    // Fires repeatedly while bytes are being sent to the server.
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };

    // Fires when the upload byte-transfer phase ends (before server responds).
    // At this point Sharp is encoding — no further progress signal is available.
    xhr.upload.onload = () => {
      onUploaded();
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText) as {
          url?: string;
          error?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && json.url) {
          resolve({ url: json.url });
        } else {
          resolve({ error: json.error ?? `HTTP ${xhr.status}` });
        }
      } catch {
        resolve({ error: `HTTP ${xhr.status}` });
      }
    };

    xhr.onerror = () => resolve({ error: "Network error" });
    xhr.ontimeout = () => resolve({ error: "Upload timed out" });
    // 2-minute timeout — Sharp encoding large images can take 30+ seconds.
    xhr.timeout = 120_000;

    xhr.send(fd);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageUploader({
  images,
  onImagesChange,
  productId,
  maxImages = 10,
  thumbnailIndex = 0,
  onThumbnailChange,
}: {
  images: string[];
  onImagesChange: (next: string[]) => void;
  productId?: string;
  maxImages?: number;
  /**
   * Index into `images` that's currently flagged as the storefront card
   * thumbnail. Defaults to 0 (matches DB default). Out-of-range values are
   * coerced to 0 in the radio render to keep the UI sane.
   */
  thumbnailIndex?: number;
  /** Fires when the admin picks a different image as the thumbnail. */
  onThumbnailChange?: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const bucket = productId ?? "new";
  const remaining = Math.max(0, maxImages - images.length);

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).slice(0, remaining);
    if (files.length === 0) return;

    setError(null);
    const total = files.length;
    const added: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!ALLOWED_MIME.includes(file.type)) {
        setError(`Unsupported type: ${file.type}. Use JPEG, PNG, WebP, or HEIC.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" exceeds 50 MB.`);
        continue;
      }

      // Show initial progress state for this file.
      setProgress({
        fileName: file.name,
        index: i + 1,
        total,
        percent: 0,
        bytesUploaded: 0,
        bytesTotal: file.size,
        processing: false,
      });

      const fd = new FormData();
      fd.set("file", file);
      fd.set("productId", bucket);

      const result = await uploadWithProgress(
        fd,
        (loaded, t) => {
          setProgress({
            fileName: file.name,
            index: i + 1,
            total,
            percent: Math.round((loaded / t) * 100),
            bytesUploaded: loaded,
            bytesTotal: t,
            processing: false,
          });
        },
        () => {
          // Upload transfer complete — server is now encoding with Sharp.
          setProgress((prev) =>
            prev
              ? {
                  ...prev,
                  percent: 100,
                  bytesUploaded: prev.bytesTotal,
                  processing: true,
                }
              : prev,
          );
        },
      );

      if (result.error) {
        setError(result.error);
        setProgress(null);
        continue;
      }
      if (result.url) added.push(result.url);
    }

    setProgress(null);
    if (added.length > 0) {
      onImagesChange([...images, ...added]);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl || fl.length === 0) return;
    startTransition(() => {
      void handleFiles(fl);
    });
    // Reset so selecting the same file again still triggers change.
    e.target.value = "";
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      startTransition(() => {
        void handleFiles(e.dataTransfer.files);
      });
    }
  }

  function handleRemove(url: string) {
    const removedIndex = images.findIndex((u) => u === url);
    startTransition(async () => {
      await deleteProductImage(url);
      const next = images.filter((u) => u !== url);
      onImagesChange(next);
      // If the removed image was the thumbnail, OR was positioned before it,
      // the thumbnail index shifts — re-anchor it so we keep pointing at the
      // same image (or fall back to 0 when the thumb itself was removed).
      if (onThumbnailChange && removedIndex !== -1) {
        if (removedIndex === thumbnailIndex || thumbnailIndex >= next.length) {
          onThumbnailChange(0);
        } else if (removedIndex < thumbnailIndex) {
          onThumbnailChange(thumbnailIndex - 1);
        }
      }
    });
  }

  const atLimit = images.length >= maxImages;
  const isUploading = pending && progress !== null;

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={atLimit}
        onClick={() => !atLimit && !pending && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !atLimit && !pending) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors " +
          (atLimit
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
            : isDragging
              ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-surface)]"
              : "border-[var(--color-brand-border)] hover:border-[var(--color-brand-primary)] hover:bg-[var(--color-brand-surface)]")
        }
      >
        <UploadCloud className="h-8 w-8 text-[var(--color-brand-text-muted)]" />
        <p className="text-sm font-medium">
          {atLimit ? (
            "Maximum images reached"
          ) : isUploading && progress ? (
            progress.processing ? (
              <span>
                Processing {progress.fileName}
                {progress.total > 1 ? ` (${progress.index} of ${progress.total})` : ""}
                &hellip;
              </span>
            ) : (
              <span>
                Uploading {progress.fileName}
                {progress.total > 1 ? ` (${progress.index} of ${progress.total})` : ""} &mdash;{" "}
                {progress.percent}%
              </span>
            )
          ) : pending ? (
            "Uploading..."
          ) : (
            "Drag & drop images here or click to upload"
          )}
        </p>

        {/* Progress bar — only visible during active upload */}
        {isUploading && progress ? (
          <div className="w-full max-w-xs space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[var(--color-brand-cta)] transition-all duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-center text-xs text-[var(--color-brand-text-muted)]">
              {progress.processing ? (
                "Encoding image — please wait..."
              ) : (
                <>
                  {formatBytes(progress.bytesUploaded)} / {formatBytes(progress.bytesTotal)}
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-brand-text-muted)]">
            JPEG, PNG, WebP, or HEIC &middot; any size — auto-compressed &middot; {images.length}/
            {maxImages} images
          </p>
        )}

        {!isUploading && onThumbnailChange ? (
          <p className="text-xs text-[var(--color-brand-text-muted)]">
            Tap the star on an image to use it as the storefront card thumbnail.
          </p>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept={[...ALLOWED_MIME, ".heic", ".heif"].join(",")}
          multiple
          className="hidden"
          onChange={onInputChange}
          disabled={atLimit || pending}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {images.map((url, idx) => {
            const isThumb = idx === thumbnailIndex;
            return (
              <div
                key={url}
                className={
                  "group relative aspect-square overflow-hidden rounded-md border bg-white " +
                  (isThumb
                    ? "border-[var(--color-brand-cta)] ring-2 ring-[var(--color-brand-cta)]/40"
                    : "border-[var(--color-brand-border)]")
                }
              >
                <Image
                  src={url}
                  alt="Product image"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 25vw, 120px"
                />
                {/* Thumbnail picker — only mounted when the parent provided
                    onThumbnailChange so we can be reused (cart line photos
                    etc.) without forcing a thumb concept. The button is
                    always visible (not hover-only) on touch devices. */}
                {onThumbnailChange ? (
                  <button
                    type="button"
                    onClick={() => onThumbnailChange(idx)}
                    disabled={pending}
                    aria-label={
                      isThumb
                        ? "Current storefront thumbnail"
                        : "Use as storefront thumbnail"
                    }
                    aria-pressed={isThumb}
                    title={
                      isThumb
                        ? "Storefront thumbnail"
                        : "Use as storefront thumbnail"
                    }
                    className={
                      "absolute left-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-sm transition-colors " +
                      (isThumb
                        ? "bg-[var(--color-brand-cta)] text-white"
                        : "bg-white/90 text-slate-700 hover:bg-white")
                    }
                  >
                    <Star
                      className={"h-3.5 w-3.5 " + (isThumb ? "fill-current" : "")}
                    />
                  </button>
                ) : null}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-xs"
                  className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleRemove(url)}
                  disabled={pending}
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </Button>
                {isThumb ? (
                  <span className="absolute bottom-1 left-1 rounded-full bg-[var(--color-brand-cta)] px-2 py-0.5 text-[10px] font-bold text-white">
                    Thumb
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
