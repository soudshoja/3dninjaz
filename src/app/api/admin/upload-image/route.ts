import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { persistProductImage } from "@/lib/product-images";

// Use Node.js runtime so persistProductImage (fs + sharp) is available.
// This also bypasses Next.js's default body-size limits for Route Handlers
// (the storage layer enforces its own 50 MB cap).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bad form data" },
      { status: 400 },
    );
  }

  const productId = String(form.get("productId") ?? "");
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Reject the legacy "new" bucket — the client must send a real product UUID
  // (pre-generated before the form is submitted). This prevents the stale
  // /uploads/products/new/<uuid> URLs that caused the image-pipeline bug.
  if (!productId || productId === "new") {
    return NextResponse.json(
      {
        error:
          "productId is required and must be a UUID — do not use 'new'. " +
          "Generate a UUID client-side before uploading.",
      },
      { status: 400 },
    );
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await persistProductImage({
      productId,
      source: buf,
      originalFilename: file.name,
      mimeType: file.type,
    });
    return NextResponse.json({ url: result.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 },
    );
  }
}
