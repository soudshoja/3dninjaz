import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { customFonts } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FONT_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_ACTIVE_FONTS = 20;
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";

/** Sanitize filename: only [a-z0-9._-], lowercase, strip everything else. */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

/** Generate a URL-safe family slug from the display name. */
function toFamilySlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

/** Ensure familySlug is unique — append -2, -3, ... if needed. */
async function uniqueSlug(base: string): Promise<string> {
  let candidate = base.slice(0, 32);
  let suffix = 2;
  while (true) {
    const [existing] = await db
      .select({ id: customFonts.id })
      .from(customFonts)
      .where(eq(customFonts.familySlug, candidate))
      .limit(1);
    if (!existing) return candidate;
    const suffixStr = `-${suffix}`;
    candidate = base.slice(0, 32 - suffixStr.length) + suffixStr;
    suffix++;
  }
}

export async function POST(req: NextRequest) {
  // CVE-2025-29927 — requireAdmin MUST be first await
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

  const displayName = String(form.get("displayName") ?? "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate font format (by name extension + mime type — browsers vary)
  const isWoff2 =
    file.name.toLowerCase().endsWith(".woff2") ||
    file.type === "font/woff2";
  const isWoff =
    file.name.toLowerCase().endsWith(".woff") ||
    file.type === "font/woff" ||
    file.type === "application/font-woff";

  if (!isWoff2 && !isWoff) {
    return NextResponse.json(
      { error: "Only .woff2 and .woff font files are accepted" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FONT_BYTES) {
    return NextResponse.json(
      { error: "Font file exceeds 3 MB limit" },
      { status: 400 },
    );
  }

  // Check active font count cap
  const [{ value: activeCount }] = await db
    .select({ value: count() })
    .from(customFonts)
    .where(eq(customFonts.isActive, true));
  if (Number(activeCount) >= MAX_ACTIVE_FONTS) {
    return NextResponse.json(
      { error: "Active font limit reached (max 20). Deactivate a font first." },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const mimeType = isWoff2 ? "font/woff2" : "font/woff";
  const ext = isWoff2 ? ".woff2" : ".woff";
  const safeFilename = sanitizeFilename(
    file.name.replace(/\.(woff2?|ttf|otf)$/i, "") || "font",
  ) + ext;

  // Write to public/uploads/fonts/<uuid>/<filename>
  const fontDir = path.join(process.cwd(), UPLOADS_DIR, "fonts", id);
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(fontDir).startsWith(root)) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 500 });
  }

  await fs.mkdir(fontDir, { recursive: true });
  const filePath = path.join(fontDir, safeFilename);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buf);

  const fileUrl = `${PUBLIC_PREFIX}/fonts/${id}/${safeFilename}`;
  const familySlug = await uniqueSlug(toFamilySlug(displayName));

  await db.insert(customFonts).values({
    id,
    displayName,
    familySlug,
    fileUrl,
    mimeType,
    isActive: true,
  });

  return NextResponse.json({ id, displayName, familySlug, fileUrl });
}
