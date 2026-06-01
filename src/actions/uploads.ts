"use server";

import { requireAdmin } from "@/lib/auth-helpers";
import { deleteUpload } from "@/lib/storage";

export type UploadResult = { url: string } | { error: string };

/**
 * Server action kept for backwards compatibility with any direct callers.
 * New code should POST to /api/admin/upload-image which uses persistProductImage
 * directly. This action is no longer used by the admin product form (the form
 * uses the Route Handler via XHR for progress tracking).
 *
 * NOTE: the `productId` field MUST be a real product UUID — never "new".
 * The Route Handler enforces this at the network boundary; this action passes
 * the value straight to writeUpload which still accepts "new" as a bucket
 * for legacy callers. New callers must pass a real UUID.
 */
export async function uploadProductImage(
  formData: FormData
): Promise<UploadResult> {
  await requireAdmin();

  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: "No file provided" };
  }

  // Reject "new" at this boundary too, matching the Route Handler.
  if (!productId || productId === "new") {
    return {
      error:
        "productId is required and must be a UUID — do not use 'new'. " +
        "Generate a UUID client-side before uploading.",
    };
  }

  try {
    const { persistProductImage } = await import("@/lib/product-images");
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await persistProductImage({
      productId,
      source: buf,
      originalFilename: file.name,
      mimeType: file.type,
    });
    return { url: result.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return { error: msg };
  }
}

export async function deleteProductImage(
  url: string
): Promise<{ success: boolean }> {
  await requireAdmin();
  try {
    await deleteUpload(url);
  } catch (err) {
    console.error("[deleteProductImage] filesystem delete failed:", url, err);
    throw err;
  }
  return { success: true };
}
