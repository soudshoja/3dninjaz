"use client";

/**
 * DialCodePicker — compact, searchable country dial-code selector.
 *
 * Replaces a wide native <select> (which sizes itself to the widest option,
 * e.g. "British Indian Ocean Territory +246", overflowing narrow grids and
 * crowding out the phone-number input). This renders a fixed-width trigger
 * showing only the flag + "+dial", and opens a searchable popover listing
 * every country by name + dial.
 *
 * Props:
 *   value     — selected dial string (without "+"), e.g. "60"
 *   onChange  — called with the new dial when a country is picked
 *   error     — when true, paints the trigger border red to match the field
 *   buttonId  — optional id for the trigger button
 *
 * Search matches country name OR dial digits. Keyboard: type to filter,
 * Arrow/Enter to choose, Escape to close. Closes on outside click.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search, Check } from "lucide-react";
import { COUNTRY_CODES, findCountryByDial, type CountryCode } from "@/lib/country-codes";
import { BRAND } from "@/lib/brand";

/** iso2 ("MY") → 🇲🇾 regional-indicator emoji. Falls back to letters for XK etc. */
function flagEmoji(iso2: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return "🏳️";
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

interface DialCodePickerProps {
  value: string;
  onChange: (dial: string) => void;
  error?: boolean;
  buttonId?: string;
}

export function DialCodePicker({ value, onChange, error, buttonId }: DialCodePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = findCountryByDial(value);

  const filtered = useMemo<CountryCode[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_CODES;
    const digits = q.replace(/\D/g, "");
    return COUNTRY_CODES.filter((c) => {
      const nameHit = c.name.toLowerCase().includes(q);
      const dialHit = digits ? c.dial.includes(digits) : false;
      return nameHit || dialHit;
    });
  }, [query]);

  // Reset active row whenever the result set changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Focus the search box when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the active row scrolled into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function choose(dial: string) {
    onChange(dial);
    setOpen(false);
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[activeIndex];
      if (c) choose(c.dial);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  const borderColor = error ? "#ef4444" : `${BRAND.ink}22`;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        id={buttonId}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected ? `Country code +${value}` : "Select country code"}
        className="flex h-full min-h-[48px] w-[92px] items-center justify-between gap-1 rounded-xl border-2 bg-white px-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E8BFF40]"
        style={{ borderColor }}
      >
        <span className="flex items-center gap-1 truncate">
          <span className="text-base leading-none" aria-hidden>
            {selected ? flagEmoji(selected.iso2) : "🏳️"}
          </span>
          <span className="font-semibold tabular-nums" style={{ color: BRAND.ink }}>
            +{value}
          </span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-slate-400" aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 max-w-[80vw] overflow-hidden rounded-xl border-2 bg-white shadow-xl"
          style={{ borderColor: `${BRAND.ink}22` }}
          role="dialog"
          aria-label="Country code search"
        >
          {/* Search */}
          <div className="border-b p-2" style={{ borderColor: `${BRAND.ink}11` }}>
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search country or code…"
                aria-label="Search country or dial code"
                className="w-full rounded-lg border-2 bg-white py-2 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E8BFF40]"
                style={{ borderColor: `${BRAND.ink}22` }}
              />
            </div>
          </div>

          {/* Results */}
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Countries"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-slate-400">No match</li>
            ) : (
              filtered.map((c, i) => {
                const isSel = c.dial === value;
                const isActive = i === activeIndex;
                return (
                  <li key={`${c.iso2}-${c.dial}`} role="option" aria-selected={isSel}>
                    <button
                      type="button"
                      onClick={() => choose(c.dial)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
                      style={{ backgroundColor: isActive ? "#0080ff14" : "transparent" }}
                    >
                      <span className="text-base leading-none" aria-hidden>
                        {flagEmoji(c.iso2)}
                      </span>
                      <span className="flex-1 truncate" style={{ color: BRAND.ink }}>
                        {c.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">+{c.dial}</span>
                      {isSel ? (
                        <Check size={14} className="shrink-0" style={{ color: "#0080ff" }} aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
