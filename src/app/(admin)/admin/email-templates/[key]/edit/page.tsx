import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getEmailTemplate } from "@/actions/admin-email-templates";
import { availableVariables, type TemplateKey } from "@/lib/email/templates";
import { BRAND } from "@/lib/brand";
import { EmailTemplateForm } from "@/components/admin/email-template-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Edit email template",
  robots: { index: false, follow: false },
};

const VALID_KEYS: TemplateKey[] = ["order_confirmation", "password_reset"];

type PageProps = { params: Promise<{ key: string }> };

export default async function EditEmailTemplatePage({ params }: PageProps) {
  await requireAdmin();
  const { key } = await params;
  if (!(VALID_KEYS as string[]).includes(key)) notFound();

  const tpl = await getEmailTemplate(key);
  if (!tpl) notFound();

  const vars = availableVariables[key as TemplateKey];

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/admin/email-templates"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to email templates
        </Link>
        <h1 className="mt-3 mb-1 font-[var(--font-heading)] text-3xl md:text-4xl">
          Edit: {key}
        </h1>
        <p className="mb-6 text-slate-600">
          Live preview is sandboxed (no JS). HTML is sanitised on save and on
          render. Use the variable chips below the textarea to insert
          placeholders at the cursor position.
        </p>
        <EmailTemplateForm
          initial={{
            key: tpl.key,
            subject: tpl.subject,
            html: tpl.html,
            variables: vars,
          }}
        />
      </div>
    </main>
  );
}
