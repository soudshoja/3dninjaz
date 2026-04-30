"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import type { CustomFont } from "@/actions/custom-fonts";
import { toggleCustomFontActive, deleteCustomFont } from "@/actions/custom-fonts";

export function FontsTable({ fonts }: { fonts: CustomFont[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      await toggleCustomFontActive(id, !current);
      router.refresh();
    });
  }

  function handleDelete(id: string, displayName: string) {
    if (!confirm(`Delete font "${displayName}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteCustomFont(id);
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-border)] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-brand-border)] bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-muted)]">
            <th className="px-4 py-3">Display Name</th>
            <th className="px-4 py-3">Family Slug</th>
            <th className="px-4 py-3">Format</th>
            <th className="px-4 py-3">Active</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-brand-border)]">
          {fonts.map((font) => (
            <tr key={font.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-[var(--color-brand-text-primary)]">
                <span style={{ fontFamily: `'${font.familySlug}', system-ui, sans-serif` }}>
                  {font.displayName}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--color-brand-text-muted)]">
                {font.familySlug}
              </td>
              <td className="px-4 py-3 text-[var(--color-brand-text-muted)]">
                {font.fileUrl.endsWith(".woff2") ? "woff2" : "woff"}
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleToggle(font.id, font.isActive)}
                  aria-pressed={font.isActive}
                  className={
                    "inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-blue)] " +
                    (font.isActive ? "bg-green-500" : "bg-gray-300")
                  }
                >
                  <span
                    className={
                      "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform " +
                      (font.isActive ? "translate-x-6" : "translate-x-1")
                    }
                  />
                  <span className="sr-only">{font.isActive ? "Active" : "Inactive"}</span>
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <a
                    href={font.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline hover:text-blue-800"
                  >
                    View
                  </a>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleDelete(font.id, font.displayName)}
                    aria-label={`Delete ${font.displayName}`}
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
