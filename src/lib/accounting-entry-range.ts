// Date-range parsing for the accounting entry pages (expenses, income, PayPal
// ledger). Pure module: no server imports, so it is safe anywhere.
//
// Kept separate from the shared picker's own helpers so these pages do not
// depend on another module landing first. Understands:
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   custom range
//   ?range=today|7d|30d|90d|this_month|last_month|this_year|all   presets
// Anything invalid falls back to the default (all time), and from > to is
// swapped. Boundaries are Malaysia time (UTC+8): [from 00:00, to+1 day 00:00).

import { todayMYT } from "@/lib/accounting-format";

/** Inclusive YYYY-MM-DD bounds. null = unbounded. */
export type EntryRange = { from: string | null; to: string | null };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!YMD.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> next calendar day (exclusive upper bound for string dates). */
export function nextDayYmd(ymd: string): string {
  return addDays(ymd, 1);
}

function presetRange(preset: string, today: string): EntryRange | null {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "this_month":
      return { from: `${y}-${pad(m)}-01`, to: today };
    case "last_month": {
      const first = new Date(Date.UTC(y, m - 2, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      return {
        from: first.toISOString().slice(0, 10),
        to: last.toISOString().slice(0, 10),
      };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: today };
    default:
      return null;
  }
}

export function resolveEntryRange(
  sp: { from?: string; to?: string; range?: string },
  fallbackPreset = "all",
): EntryRange {
  const today = todayMYT();
  let from = sp.from && isRealDate(sp.from) ? sp.from : null;
  let to = sp.to && isRealDate(sp.to) ? sp.to : null;
  if (from || to) {
    if (from && to && from > to) [from, to] = [to, from];
    return { from, to };
  }
  const preset = sp.range ? presetRange(sp.range, today) : null;
  return preset ?? presetRange(fallbackPreset, today) ?? { from: null, to: null };
}

/** MYT instants for timestamp columns: [lo, hi). Either may be null. */
export function mytBounds(range: EntryRange | null | undefined): {
  lo: Date | null;
  hi: Date | null;
} {
  let lo: Date | null = null;
  let hi: Date | null = null;
  if (range?.from && isRealDate(range.from)) lo = new Date(`${range.from}T00:00:00+08:00`);
  if (range?.to && isRealDate(range.to)) hi = new Date(`${nextDayYmd(range.to)}T00:00:00+08:00`);
  return { lo, hi };
}

/** Human label for the active range, e.g. "1 Nov 2026 to 14 Nov 2026" or "All time". */
export function describeRange(range: EntryRange): string {
  if (!range.from && !range.to) return "All time";
  const f = (s: string) =>
    new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  if (range.from && range.to) return `${f(range.from)} to ${f(range.to)}`;
  if (range.from) return `From ${f(range.from)}`;
  return `Up to ${f(range.to as string)}`;
}
