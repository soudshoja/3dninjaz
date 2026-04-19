"use server";

import { db } from "@/lib/db";
import { emailTemplates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { emailTemplateSchema } from "@/lib/validators";
import { sanitiseEmailHtml } from "@/lib/email/sanitize";
import {
  availableVariables,
  type TemplateKey,
} from "@/lib/email/templates";

// ============================================================================
// Plan 05-06 admin email-templates CRUD.
//
// IMPORTANT (T-05-06-EoP):
//   requireAdmin() FIRST in every export.
//
// IMPORTANT (T-05-06-HTML):
//   updateEmailTemplate sanitises HTML via DOMPurify BEFORE persisting.
//   The renderer (templates.ts) sanitises again at render time. Both layers
//   are needed because admin trust is not absolute (defense-in-depth).
// ============================================================================

export type EmailTemplateRow = {
  key: string;
  subject: string;
  html: string;
  variables: string[];
  updatedAt: Date;
};

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  await requireAdmin();
  const rows = await db.select().from(emailTemplates);
  // Stable order: order_confirmation first then password_reset
  const order = ["order_confirmation", "password_reset"];
  rows.sort(
    (a, b) =>
      (order.indexOf(a.key) === -1 ? 99 : order.indexOf(a.key)) -
      (order.indexOf(b.key) === -1 ? 99 : order.indexOf(b.key)),
  );
  return rows.map((r) => ({
    key: r.key,
    subject: r.subject,
    html: r.html,
    variables: Array.isArray(r.variables) ? r.variables : [],
    updatedAt: r.updatedAt,
  }));
}

export async function getEmailTemplate(
  key: string,
): Promise<EmailTemplateRow | null> {
  await requireAdmin();
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.key, key))
    .limit(1);
  if (!row) return null;
  return {
    key: row.key,
    subject: row.subject,
    html: row.html,
    variables: Array.isArray(row.variables) ? row.variables : [],
    updatedAt: row.updatedAt,
  };
}

type UpdateResult = { ok: true } | { ok: false; error: string };

export async function updateEmailTemplate(
  formData: FormData,
): Promise<UpdateResult> {
  await requireAdmin();

  const parsed = emailTemplateSchema.safeParse({
    key: formData.get("key"),
    subject: formData.get("subject"),
    html: formData.get("html"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { key, subject, html } = parsed.data;
  const safeHtml = sanitiseEmailHtml(html);
  const vars = availableVariables[key as TemplateKey] ?? [];

  await db
    .update(emailTemplates)
    .set({ subject, html: safeHtml, variables: vars })
    .where(eq(emailTemplates.key, key));

  revalidatePath("/admin/email-templates");
  revalidatePath(`/admin/email-templates/${key}/edit`);
  return { ok: true };
}
