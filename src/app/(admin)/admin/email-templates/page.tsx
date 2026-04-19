import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listEmailTemplates } from "@/actions/admin-email-templates";
import { renderTemplate } from "@/lib/email/templates";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Email templates",
  robots: { index: false, follow: false },
};

const TEMPLATE_LABELS: Record<string, string> = {
  order_confirmation: "Order confirmation",
  password_reset: "Password reset",
};

export default async function AdminEmailTemplatesPage() {
  await requireAdmin();
  let rows = await listEmailTemplates();
  if (rows.length < 2) {
    // Lazy-seed both templates so the queue always has the expected 2 rows.
    await renderTemplate("order_confirmation", {});
    await renderTemplate("password_reset", {});
    rows = await listEmailTemplates();
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Email templates
          </h1>
          <p className="mt-1 text-slate-600">
            Edit transactional email subject + HTML body. Variables marked
            <code className="mx-1 px-1 rounded bg-white text-xs font-mono">
              {"{{name}}"}
            </code>
            are substituted server-side at send time.
          </p>
        </header>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "#ffffff" }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-[600px] w-full text-sm">
              <thead style={{ backgroundColor: `${BRAND.ink}0d` }}>
                <tr className="text-left">
                  <th className="p-3">Template</th>
                  <th className="p-3">Subject (rendered)</th>
                  <th className="p-3">Updated</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-black/10">
                    <td className="p-3 font-semibold">
                      {TEMPLATE_LABELS[r.key] ?? r.key}
                    </td>
                    <td className="p-3 text-sm truncate max-w-[400px]">
                      {r.subject}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {new Date(r.updatedAt).toLocaleString("en-MY")}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/email-templates/${r.key}/edit`}
                        className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap min-h-[40px]"
                        style={{
                          backgroundColor: BRAND.ink,
                          color: "#ffffff",
                        }}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
