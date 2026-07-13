"use server";

// ============================================================================
// Invoice import — extract (Tika) → parse → preview → confirm.
//
// previewInvoice: reads the already-uploaded file, OCR/text-extracts it via
//   Tika, auto-detects fields (date/amount/category auto; vendor flagged if
//   unclear), and returns an editable preview.
// confirmInvoiceImport: persists the admin-confirmed fields as an expense,
//   keeping the uploaded file as the source_doc_url receipt (NOT deleted).
//
// requireAdmin() first in every export. "use server" → only async exports;
// types live in @/lib/accounting-types.
// ============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { expenses } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import { tikaExtract } from "@/lib/tika";
import { parseInvoiceText } from "@/lib/invoice-parser";
import { expenseSchema } from "@/lib/validators";
import { listKnownVendors } from "@/actions/admin-accounting";
import type { InvoicePreview, ConfirmInvoiceInput, MutateResult } from "@/lib/accounting-types";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";

/** Map a /uploads/... public URL to an on-disk path with a traversal guard. */
function resolveUploadPath(uploadedUrl: string): string | null {
  if (!uploadedUrl.startsWith(PUBLIC_PREFIX + "/invoices/")) return null;
  const rel = uploadedUrl.slice(PUBLIC_PREFIX.length + 1); // invoices/<id>/original.ext
  // Reject any ".." segment before joining so embedded traversal can't escape.
  if (rel.split(/[\\/]/).includes("..")) return null;
  const abs = path.resolve(path.join(process.cwd(), UPLOADS_DIR, rel));
  // Confine to the invoices directory specifically, with a separator boundary
  // (prevents sibling-prefix escapes like .../uploads-evil).
  const invoicesRoot = path.resolve(path.join(process.cwd(), UPLOADS_DIR, "invoices"));
  if (abs !== invoicesRoot && !abs.startsWith(invoicesRoot + path.sep)) return null;
  return abs;
}

export async function previewInvoice(
  uploadedUrl: string,
  fileName: string,
): Promise<InvoicePreview> {
  const { db } = await requireAdmin();
  void db; // no direct db access here — file read + Tika extract only

  const filePath = resolveUploadPath(uploadedUrl);
  if (!filePath) return { ok: false, error: "Invalid file reference" };

  let buf: Buffer;
  try {
    buf = await fs.readFile(filePath);
  } catch (e) {
    console.error("[invoice-import] read", e);
    return { ok: false, error: "Uploaded file not found — please re-upload" };
  }

  let text: string;
  try {
    text = await tikaExtract(buf);
  } catch (e) {
    console.error("[invoice-import] tika", e);
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Could not read the document (${e.message}). Try again or enter the expense manually.`
          : "Could not read the document",
    };
  }

  const parsed = parseInvoiceText(text);
  const knownVendors = await listKnownVendors();

  return {
    ok: true,
    uploadedUrl,
    fileName,
    extractedText: text.slice(0, 5000),
    parsed,
    knownVendors,
  };
}

export async function confirmInvoiceImport(
  input: ConfirmInvoiceInput,
): Promise<MutateResult> {
  const { db } = await requireAdmin();

  const parsed = expenseSchema.safeParse({
    expenseDate: input.expenseDate?.trim(),
    category: input.category,
    note: input.note?.trim() || null,
    amount: input.amount?.trim().replace(",", "."),
    paidFrom: input.paidFrom || "bank",
    supplierName: input.supplierName?.trim() || null,
    sourceDocUrl: input.uploadedUrl?.trim() || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  const id = randomUUID();
  try {
    await db.insert(expenses).values({
      id,
      expenseDate: d.expenseDate,
      category: d.category,
      note: d.note ?? null,
      amount: d.amount,
      paidFrom: d.paidFrom,
      supplierName: d.supplierName ?? null,
      sourceDocUrl: d.sourceDocUrl ?? null,
    });
  } catch (e) {
    console.error("[invoice-import] confirm insert", e);
    return { ok: false, error: "Unable to save expense" };
  }

  revalidatePath("/admin/accounting/expenses");
  revalidatePath("/admin/accounting");
  return { ok: true, id };
}
