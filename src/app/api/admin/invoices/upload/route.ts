import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Invoice/receipt upload for accounting import. Stores the original document
// (PDF or image) under public/uploads/invoices/<uuid>/original.<ext> so it can
// be (a) sent to Tika for extraction and (b) kept as the source_doc_url receipt.

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  // Defensive: client downscales HEIC→JPEG, but accept it as a fallback.
  "image/heic": "heic",
  "image/heif": "heif",
};

export async function POST(req: NextRequest) {
  // CVE-2025-29927 — requireAdmin MUST be the first await.
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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Only PDF, JPEG or PNG files are accepted" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 10 MB)" },
      { status: 413 },
    );
  }

  const id = crypto.randomUUID();
  const dir = path.join(process.cwd(), UPLOADS_DIR, "invoices", id);
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(dir).startsWith(root)) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 500 });
  }

  await fs.mkdir(dir, { recursive: true });
  const filename = `original.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buf);

  const uploadedUrl = `${PUBLIC_PREFIX}/invoices/${id}/${filename}`;
  return NextResponse.json({ fileId: id, uploadedUrl, fileName: file.name });
}
