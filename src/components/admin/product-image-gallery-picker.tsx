"use client";

/**
 * ProductImageGalleryPicker
 *
 * Modal that lists all images already uploaded to a product's upload bucket.
 * Admin can click a thumbnail to re-use it as a Select option image without
 * creating a duplicate file.
 *
 * Props:
 *   open          — controlled open state
 *   onOpenChange  — setter
 *   productId     — used to call listProductImages server action
 *   onSelect      — called with the chosen relative URL (e.g. /uploads/products/<pid>/<uuid>)
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Images } from "lucide-react";
import { listProductImages } from "@/actions/configurator";
import { BRAND } from "@/lib/brand";

type GalleryImage = { url: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  onSelect: (url: string) => void;
};

export function ProductImageGalleryPicker({
  open,
  onOpenChange,
  productId,
  onSelect,
}: Props) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Fetch images whenever the modal opens.
  useEffect(() => {
    if (!open) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listProductImages(productId)
      .then((imgs) => {
        if (!cancelled) {
          setImages(imgs);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  function handleConfirm() {
    if (!selected) return;
    onSelect(selected);
    onOpenChange(false);
  }

  function thumbSrc(url: string) {
    // The upload pipeline stores 400w.jpg inside the base-url directory.
    return url.endsWith("/") ? url + "400w.jpg" : url + "/400w.jpg";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] w-[94vw] p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="h-4 w-4" style={{ color: BRAND.blue }} aria-hidden />
            Pick from product gallery
          </DialogTitle>
          <DialogDescription className="text-sm">
            Select an image already uploaded to this product to reuse it — no duplicate files.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" aria-label="Loading images" />
          </div>
        ) : images.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No images uploaded to this product yet.
          </div>
        ) : (
          <div
            className="grid gap-2 overflow-y-auto rounded-lg border p-2"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
              maxHeight: "320px",
              borderColor: "#E4E4E7",
            }}
          >
            {images.map((img) => {
              const isSelected = selected === img.url;
              return (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => setSelected(img.url)}
                  className="relative overflow-hidden rounded border transition-all focus:outline-none focus-visible:ring-2"
                  style={{
                    width: 80,
                    height: 80,
                    borderColor: isSelected ? BRAND.green : "#E4E4E7",
                    borderWidth: isSelected ? 2 : 1,
                    boxShadow: isSelected ? `0 0 0 2px ${BRAND.green}33` : undefined,
                  }}
                  title={img.name}
                  aria-label={`Select image ${img.name}`}
                  aria-pressed={isSelected}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbSrc(img.url)}
                    alt={img.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  {isSelected && (
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ backgroundColor: `${BRAND.green}22` }}
                      aria-hidden
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden
                      >
                        <circle cx="10" cy="10" r="10" fill={BRAND.green} />
                        <path
                          d="M6 10l3 3 5-5"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selected}
            onClick={handleConfirm}
            style={{ backgroundColor: BRAND.green, color: "white" }}
          >
            Use this image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
