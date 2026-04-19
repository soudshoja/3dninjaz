"use server";

import { requireAdmin } from "@/lib/auth-helpers";
import { writeUpload, deleteUpload } from "@/lib/storage";

export type UploadResult = { url: string } | { error: string };

export async function uploadProductImage(
  formData: FormData
): Promise<UploadResult> {
  await requireAdmin();

  const bucket = String(formData.get("productId") ?? "new");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: "No file provided" };
  }

  try {
    const url = await writeUpload(bucket, file);
    return { url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return { error: msg };
  }
}

export async function deleteProductImage(
  url: string
): Promise<{ success: boolean }> {
  await requireAdmin();
  await deleteUpload(url);
  return { success: true };
}
