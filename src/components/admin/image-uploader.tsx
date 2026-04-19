"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { UploadCloud, X } from "lucide-react";
import {
  uploadProductImage,
  deleteProductImage,
} from "@/actions/uploads";
import { Button } from "@/components/ui/button";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export function ImageUploader({
  images,
  onImagesChange,
  productId,
  maxImages = 5,
}: {
  images: string[];
  onImagesChange: (next: string[]) => void;
  productId?: string;
  maxImages?: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const bucket = productId ?? "new";
  const remaining = Math.max(0, maxImages - images.length);

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).slice(0, remaining);
    if (files.length === 0) return;

    setError(null);

    const added: string[] = [];
    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.type)) {
        setError(`Unsupported type: ${file.type}. Use JPEG, PNG, or WebP.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" exceeds 5 MB.`);
        continue;
      }

      const fd = new FormData();
      fd.set("file", file);
      fd.set("productId", bucket);
      const result = await uploadProductImage(fd);
      if ("error" in result) {
        setError(result.error);
        continue;
      }
      added.push(result.url);
    }

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
    startTransition(async () => {
      await deleteProductImage(url);
      onImagesChange(images.filter((u) => u !== url));
    });
  }

  const atLimit = images.length >= maxImages;

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
          {atLimit
            ? "Maximum images reached"
            : pending
              ? "Uploading..."
              : "Drag & drop images here or click to upload"}
        </p>
        <p className="text-xs text-[var(--color-brand-text-muted)]">
          JPEG, PNG, or WebP &middot; up to 5 MB each &middot; {images.length}/
          {maxImages} images
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_MIME.join(",")}
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
          {images.map((url) => (
            <div
              key={url}
              className="group relative aspect-square overflow-hidden rounded-md border border-[var(--color-brand-border)] bg-white"
            >
              <Image
                src={url}
                alt="Product image"
                fill
                className="object-cover"
                sizes="(max-width: 640px) 25vw, 120px"
              />
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
