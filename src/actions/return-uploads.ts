"use server";

/**
 * 260601-afs — Customer-side return review photo upload.
 *
 * THREAT MODEL:
 *  - T-afs-auth: requireUser() FIRST await on every export.
 *  - T-afs-IDOR: ownership gate — verify orders.userId === session.user.id
 *    before accepting a file. Same null-shape for missing/not-yours orders.
 *  - T-afs-mime: size/type caps reuse the same limits as the existing pipeline
 *    (50MB pre-compress cap, allowed MIME set in storage.ts).
 *  - T-afs-path: files stored under returns/<orderId>/<uuid>.<ext> with a
 *    sanitised bucket (storage.ts safeBucket ensures no path traversal).
 */

import { eq } from "drizzle-orm";
import { orders } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { writeReturnPhoto } from "@/lib/storage-returns";

export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Upload a single return review photo. Returns the public path on success.
 * The caller collects up to 4 paths then passes them to submitReturnRequest.
 */
export async function uploadReturnPhoto(
  orderId: string,
  formData: FormData,
): Promise<UploadResult> {
  const { db, ...session } = await requireUser();

  // Ownership gate (T-afs-IDOR).
  const [order] = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.userId !== session.user.id) {
    return { ok: false, error: "Order not found." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided." };
  }

  try {
    const publicPath = await writeReturnPhoto(orderId, file);
    return { ok: true, path: publicPath };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed. Please try again.";
    return { ok: false, error: message };
  }
}
