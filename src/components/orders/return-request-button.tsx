"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { Undo2, Upload, X } from "lucide-react";
import { submitReturnRequest } from "@/actions/order-requests";
import { uploadReturnPhoto } from "@/actions/return-uploads";
import { BRAND } from "@/lib/brand";

type OrderLine = { id: string; productName: string; quantity: number };

/**
 * 260601-afs — Return-for-replacement form.
 * Replaces the simple reason-only form with:
 *   - Per-item checklist (each line + qty stepper, max = ordered qty)
 *   - 1–4 review photos (multi file input → upload action → thumbnails + remove)
 *   - Reason textarea (10–1000 chars)
 * Copy: "return / replacement" — never "refund".
 */
export function ReturnRequestButton({
  orderId,
  orderLines,
}: {
  orderId: string;
  orderLines: OrderLine[];
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Per-item selection: map from orderItemId -> qty (0 = not selected)
  const [itemQtys, setItemQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(orderLines.map((l) => [l.id, 0])),
  );

  // Photos: list of { path: string (server path), objectUrl: string (preview) }
  const [photos, setPhotos] = useState<
    Array<{ path: string; objectUrl: string }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleQtyChange = useCallback(
    (itemId: string, delta: number, max: number) => {
      setItemQtys((prev) => {
        const next = Math.max(0, Math.min(max, (prev[itemId] ?? 0) + delta));
        return { ...prev, [itemId]: next };
      });
    },
    [],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const remaining = 4 - photos.length;
    const toUpload = files.slice(0, remaining);
    if (toUpload.length === 0) {
      setUploadError("Maximum 4 photos allowed.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    for (const file of toUpload) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadReturnPhoto(orderId, fd);
      if (res.ok) {
        const objectUrl = URL.createObjectURL(file);
        setPhotos((prev) => [...prev, { path: res.path, objectUrl }]);
      } else {
        setUploadError(res.error);
        break;
      }
    }

    setUploading(false);
    // Reset file input so the same file can be re-selected after removal
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].objectUrl);
      copy.splice(index, 1);
      return copy;
    });
  };

  const selectedItems = Object.entries(itemQtys)
    .filter(([, qty]) => qty > 0)
    .map(([orderItemId, qty]) => ({ orderItemId, qty }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (selectedItems.length === 0) {
      setStatus({ type: "error", message: "Select at least one item to return." });
      return;
    }
    if (photos.length === 0) {
      setStatus({ type: "error", message: "Upload at least 1 review photo." });
      return;
    }

    startTransition(async () => {
      const res = await submitReturnRequest({
        orderId,
        reason,
        items: selectedItems,
        photos: photos.map((p) => p.path),
      });
      if (res.ok) {
        setStatus({ type: "success", message: res.message });
        setReason("");
        setItemQtys(Object.fromEntries(orderLines.map((l) => [l.id, 0])));
        photos.forEach((p) => URL.revokeObjectURL(p.objectUrl));
        setPhotos([]);
        setOpen(false);
      } else {
        setStatus({ type: "error", message: res.error });
      }
    });
  };

  const reset = () => {
    setOpen(false);
    setStatus(null);
    setReason("");
    setItemQtys(Object.fromEntries(orderLines.map((l) => [l.id, 0])));
    photos.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    setPhotos([]);
    setUploadError(null);
  };

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 min-h-[60px] px-5 rounded-lg font-bold border-2"
          style={{ borderColor: BRAND.purple, color: BRAND.purple }}
        >
          <Undo2 className="h-5 w-5" aria-hidden />
          Request return / replacement
        </button>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <p className="text-sm text-slate-600">
            Not happy with your order? Select the items you want to return and
            upload 1–4 photos showing the issue. We&apos;ll review and
            re-make your items.
          </p>

          {/* Per-item picker */}
          <fieldset>
            <legend className="text-sm font-semibold mb-2">
              Items to return
            </legend>
            <ul className="grid gap-2">
              {orderLines.map((line) => {
                const qty = itemQtys[line.id] ?? 0;
                return (
                  <li
                    key={line.id}
                    className="flex items-center gap-3 rounded-xl border-2 px-3 py-2"
                    style={{ borderColor: qty > 0 ? BRAND.purple : `${BRAND.ink}18` }}
                  >
                    <span className="flex-1 text-sm font-medium truncate">
                      {line.productName}
                      <span className="ml-1 text-slate-500 font-normal">
                        (ordered: {line.quantity})
                      </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => handleQtyChange(line.id, -1, line.quantity)}
                        className="w-7 h-7 rounded-full border-2 font-bold text-base leading-none disabled:opacity-30"
                        style={{ borderColor: BRAND.ink, color: BRAND.ink }}
                        disabled={qty === 0}
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-bold">
                        {qty}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => handleQtyChange(line.id, 1, line.quantity)}
                        className="w-7 h-7 rounded-full border-2 font-bold text-base leading-none disabled:opacity-30"
                        style={{ borderColor: BRAND.purple, color: BRAND.purple }}
                        disabled={qty >= line.quantity}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {/* Photo uploader */}
          <div>
            <p className="text-sm font-semibold mb-2">
              Review photos{" "}
              <span className="font-normal text-slate-500">
                ({photos.length}/4 — min 1 required)
              </span>
            </p>
            {photos.length > 0 ? (
              <div className="flex gap-2 flex-wrap mb-2">
                {photos.map((p, idx) => (
                  <div key={p.path} className="relative w-20 h-20 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.objectUrl}
                      alt={`Review photo ${idx + 1}`}
                      className="w-20 h-20 rounded-lg object-cover border-2"
                      style={{ borderColor: `${BRAND.ink}22` }}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      aria-label="Remove photo"
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: "#DC2626" }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {photos.length < 4 ? (
              <label
                className="inline-flex items-center gap-2 cursor-pointer min-h-[44px] px-4 rounded-lg border-2 border-dashed text-sm font-semibold"
                style={{ borderColor: BRAND.purple, color: BRAND.purple }}
              >
                <Upload className="w-4 h-4" aria-hidden />
                {uploading ? "Uploading…" : "Add photo"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="sr-only"
                  disabled={uploading || pending}
                  onChange={handleFileChange}
                  multiple
                />
              </label>
            ) : null}
            {uploadError ? (
              <p className="text-xs mt-1" style={{ color: "#DC2626" }}>
                {uploadError}
              </p>
            ) : null}
          </div>

          {/* Reason */}
          <div>
            <label
              className="text-sm font-semibold block mb-1"
              htmlFor={`return-reason-${orderId}`}
            >
              Tell us what went wrong
            </label>
            <textarea
              id={`return-reason-${orderId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={3}
              required
              minLength={10}
              className="w-full rounded-xl border-2 px-4 py-3 min-h-[80px] focus:outline-none focus:ring-2 bg-white text-sm"
              style={{ borderColor: `${BRAND.ink}22` }}
              placeholder="Describe the issue — damaged, wrong size, print quality, etc. (10–1000 chars)"
            />
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            <button
              type="submit"
              disabled={pending || uploading}
              className="inline-flex items-center justify-center min-h-[52px] px-5 rounded-lg font-bold disabled:opacity-40 text-sm"
              style={{ backgroundColor: BRAND.purple, color: "#ffffff" }}
            >
              {pending ? "Submitting…" : "Submit return request"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center min-h-[52px] px-5 rounded-lg font-bold border-2 text-sm"
              style={{ borderColor: BRAND.ink, color: BRAND.ink }}
            >
              Never mind
            </button>
          </div>
        </form>
      )}
      {status ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm mt-2"
          style={{
            color: status.type === "success" ? "#16a34a" : "#DC2626",
          }}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
