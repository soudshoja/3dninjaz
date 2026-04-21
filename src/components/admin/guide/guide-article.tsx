"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

type Props = {
  title: string;
  category: string;
  content: string;
};

/**
 * Renders a single admin guide article. Markdown is rendered client-side via
 * react-markdown + remark-gfm (tables, strikethrough, task lists).
 *
 * Table of contents is extracted from h2/h3 headings found in the content.
 */
export function GuideArticle({ title, category, content }: Props) {
  // Extract h2/h3 headings for a simple TOC
  const headings: Array<{ level: 2 | 3; text: string; id: string }> = [];
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length as 2 | 3;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    headings.push({ level, text, id });
  }

  // Suppress unused variable warning — title is passed by parent but displayed
  // inside the markdown h1, so we just need it for aria if needed.
  void title;

  return (
    <div className="flex gap-8 max-w-5xl">
      {/* Main content */}
      <article className="flex-1 min-w-0">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm" aria-label="Breadcrumb">
          <Link
            href="/admin/guide"
            className="underline decoration-dotted"
            style={{ color: BRAND.blue }}
          >
            Guide
          </Link>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-500">{category}</span>
        </nav>

        <div
          className="prose prose-slate max-w-none
            prose-headings:font-[var(--font-heading)]
            prose-h1:text-3xl prose-h1:mb-6
            prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
            prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
            prose-p:text-slate-700 prose-p:leading-relaxed
            prose-li:text-slate-700
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
            prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
            prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-xl
            prose-table:text-sm
            prose-th:bg-slate-50 prose-th:font-semibold
            prose-blockquote:border-l-4 prose-blockquote:border-blue-300 prose-blockquote:text-slate-600
          "
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Add id anchors to headings for TOC links
              h2: ({ children, ...props }) => {
                const text = String(children);
                const id = text
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, "");
                return (
                  <h2 id={id} {...props}>
                    {children}
                  </h2>
                );
              },
              h3: ({ children, ...props }) => {
                const text = String(children);
                const id = text
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, "");
                return (
                  <h3 id={id} {...props}>
                    {children}
                  </h3>
                );
              },
              // Internal /admin links stay in tab; external links open in new tab
              a: ({ href, children, ...props }) => {
                if (href?.startsWith("/admin")) {
                  return (
                    <Link href={href} {...props}>
                      {children}
                    </Link>
                  );
                }
                const isExternal =
                  href?.startsWith("http://") ||
                  href?.startsWith("https://");
                return (
                  <a
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </article>

      {/* Table of contents — only shown when there are 2+ headings */}
      {headings.length >= 2 ? (
        <aside className="hidden lg:block w-56 shrink-0">
          <div
            className="sticky top-8 rounded-xl border p-4"
            style={{
              borderColor: `${BRAND.ink}18`,
              backgroundColor: "#fafafa",
            }}
          >
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              On this page
            </p>
            <nav className="flex flex-col gap-1.5">
              {headings.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  style={{ paddingLeft: h.level === 3 ? "0.75rem" : "0" }}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
