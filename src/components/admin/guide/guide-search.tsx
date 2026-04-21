"use client";

import { useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export type SearchableArticle = {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  href: string;
};

type Props = {
  articles: SearchableArticle[];
};

/**
 * Client-side fuzzy search over admin guide articles.
 * Matches on title, category, and tags. Content is not included here to
 * keep the client bundle small — title/category/tag matching covers 90% of
 * use cases.
 */
export function GuideSearch({ articles }: Props) {
  const [query, setQuery] = useState("");

  const results =
    query.trim().length < 2
      ? []
      : articles.filter((a) => {
          const q = query.toLowerCase();
          return (
            a.title.toLowerCase().includes(q) ||
            a.category.toLowerCase().includes(q) ||
            a.tags.some((t) => t.toLowerCase().includes(q))
          );
        });

  const showResults = query.trim().length >= 2;

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide (e.g. refund, product, shipping…)"
          className="w-full rounded-xl border-2 px-4 py-3 pr-10 text-sm min-h-[48px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          style={{ borderColor: `${BRAND.ink}22` }}
          aria-label="Search admin guide"
          aria-autocomplete="list"
          aria-controls="guide-search-results"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {showResults && (
        <div
          id="guide-search-results"
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border bg-white shadow-lg overflow-hidden"
          style={{ borderColor: `${BRAND.ink}18` }}
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              No articles found for &ldquo;{query}&rdquo;
            </p>
          ) : (
            <ul>
              {results.slice(0, 8).map((a) => (
                <li key={a.slug} role="option" aria-selected="false">
                  <Link
                    href={a.href}
                    onClick={() => setQuery("")}
                    className="flex flex-col px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                  >
                    <span className="font-semibold text-sm text-slate-800">
                      {a.title}
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5">
                      {a.category}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
