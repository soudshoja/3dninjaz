"use client";

import { useMemo } from "react";
import { BRAND } from "@/lib/brand";

const SAMPLE_VARS: Record<string, string> = {
  customer_name: "Bob Tan",
  order_number: "PN-1234ABCD",
  order_total: "RM 199.50 MYR",
  order_link: "https://3dninjaz.com/orders/sample",
  items_table:
    '<tr><td style="padding:12px 0;border-bottom:1px solid #eee;"><strong>Sample Dragon</strong><br><span style="color:#666;font-size:13px;">Size M · Qty 1</span></td><td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">RM 199.50</td></tr>',
  reset_link: "https://3dninjaz.com/reset?token=sample",
};

function escapeForAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sandboxed live preview iframe (T-05-06-HTML).
 *
 * - srcDoc = no network fetch, content stays in-page.
 * - sandbox="" with NO `allow-scripts` token → JS execution is blocked
 *   even if admin pastes <script> (DOMPurify already strips them, but
 *   this is belt-and-braces).
 *
 * Variables are substituted client-side using SAMPLE_VARS so the admin
 * sees a realistic preview without round-tripping to the server.
 * `items_table` is treated as raw HTML (matches HTML_VARS in templates.ts).
 */
export function EmailTemplatePreview({
  html,
  variables,
}: {
  html: string;
  variables: string[];
}) {
  const rendered = useMemo(() => {
    let out = html;
    for (const name of variables) {
      const sample = SAMPLE_VARS[name] ?? `[${name}]`;
      const value = name === "items_table" ? sample : escapeForAttr(sample);
      out = out.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), value);
    }
    return out;
  }, [html, variables]);

  return (
    <div
      className="rounded-2xl overflow-hidden border-2"
      style={{ borderColor: `${BRAND.ink}22` }}
    >
      <div
        className="px-4 py-2 text-xs text-slate-500 border-b"
        style={{ backgroundColor: "#f8fafc" }}
      >
        Preview · sandboxed · sample variables
      </div>
      <iframe
        title="Email preview"
        srcDoc={rendered}
        sandbox=""
        className="w-full bg-white"
        style={{ height: 600 }}
      />
    </div>
  );
}
