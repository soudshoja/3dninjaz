// Shared date-range model for the admin dashboard and every accounting page.
//
// PURE module: no server-only imports, no DB, no `Date.now()` unless the caller
// leaves `now` out. Safe to import from client components (the range picker).
//
// Conventions
//   - All calendar days are Malaysia time (MYT, UTC+8, no DST).
//   - A range is inclusive "YYYY-MM-DD" strings; the instant bounds used for
//     order timestamps are [from 00:00+08:00, to+1day 00:00+08:00).
//   - URL: ?range=<preset> (legacy 7d|30d|90d keep working) OR
//          ?from=YYYY-MM-DD&to=YYYY-MM-DD (custom). Anything invalid falls back
//          to the page default; from > to is swapped.

export const RANGE_PRESETS = [
  "today",
  "7d",
  "30d",
  "90d",
  "this_month",
  "last_month",
  "this_year",
  "all",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  this_month: "This month",
  last_month: "Last month",
  this_year: "This year",
  all: "All time",
};

export type RangeBucket = "day" | "week" | "month";

/** Inclusive "YYYY-MM-DD" bounds; null = unbounded on that side. */
export type DateRange = { from: string | null; to: string | null };

export type ResolvedRange = {
  preset: RangePreset | "custom";
  from: string | null;
  to: string | null;
  /** Instant of from 00:00 MYT, or null when unbounded. */
  start: Date | null;
  /** Instant of (to + 1 day) 00:00 MYT (exclusive), or null when unbounded. */
  endExclusive: Date | null;
  /** Number of calendar days covered, null when unbounded. */
  days: number | null;
  bucket: RangeBucket;
  /** Human label, e.g. "Last 30 days" or "1 Oct 2026 to 14 Nov 2026". */
  label: string;
};

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ---------------------------------------------------------------------------
// Calendar helpers (all operate on "YYYY-MM-DD" strings; arithmetic is done in
// UTC so there is no local-timezone leakage)
// ---------------------------------------------------------------------------

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
export function isValidYmd(s: string | null | undefined): s is string {
  if (!s) return false;
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function ymdToUtcMs(ymd: string): number {
  const m = YMD_RE.exec(ymd)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function utcMsToYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  return utcMsToYmd(ymdToUtcMs(ymd) + n * DAY_MS);
}

/** Inclusive day count between two valid ymd strings (from <= to). */
export function daysBetween(from: string, to: string): number {
  return Math.round((ymdToUtcMs(to) - ymdToUtcMs(from)) / DAY_MS) + 1;
}

/** Calendar day in Malaysia time for an instant. */
export function mytYmd(d: Date): string {
  return new Date(d.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instant of 00:00 MYT on a calendar day. */
export function mytStartOfDay(ymd: string): Date {
  return new Date(ymdToUtcMs(ymd) - MYT_OFFSET_MS);
}

export function todayMyt(now: Date = new Date()): string {
  return mytYmd(now);
}

function firstOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function lastOfMonth(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return utcMsToYmd(Date.UTC(y, m, 1) - DAY_MS);
}

// ---------------------------------------------------------------------------
// Bounds + buckets
// ---------------------------------------------------------------------------

/**
 * Instant bounds for an inclusive ymd range, ready for
 * `gte(col, start)` / `lt(col, endExclusive)`. Invalid strings count as
 * unbounded so a junk param can never hand an Invalid Date to the driver.
 */
export function rangeBounds(range: DateRange): { start: Date | null; endExclusive: Date | null } {
  const start = isValidYmd(range.from) ? mytStartOfDay(range.from) : null;
  const endExclusive = isValidYmd(range.to) ? mytStartOfDay(addDays(range.to, 1)) : null;
  return { start, endExclusive };
}

/** daily (<= 31 days), weekly (<= 180), monthly otherwise or when unbounded. */
export function bucketForDays(days: number | null): RangeBucket {
  if (days == null) return "month";
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

export function bucketForRange(range: DateRange): RangeBucket {
  if (isValidYmd(range.from) && isValidYmd(range.to)) {
    const [a, b] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
    return bucketForDays(daysBetween(a, b));
  }
  return "month";
}

/** Monday on or before a calendar day. */
function mondayOf(ymd: string): string {
  const dow = new Date(ymdToUtcMs(ymd)).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return addDays(ymd, -back);
}

/** Key of the bucket a calendar day falls into (day: itself, week: Monday, month: 1st). */
export function bucketKey(ymd: string, bucket: RangeBucket): string {
  if (bucket === "day") return ymd;
  if (bucket === "week") return mondayOf(ymd);
  return firstOfMonth(ymd);
}

/** Bucket key for an instant, using the MYT calendar day. */
export function bucketKeyForInstant(d: Date, bucket: RangeBucket): string {
  return bucketKey(mytYmd(d), bucket);
}

/** First and last calendar day (inclusive) covered by a bucket key. */
export function bucketBounds(key: string, bucket: RangeBucket): { from: string; to: string } {
  if (bucket === "day") return { from: key, to: key };
  if (bucket === "week") return { from: key, to: addDays(key, 6) };
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return { from: key, to: utcMsToYmd(Date.UTC(y, m, 1) - 86_400_000) };
}

/** Every bucket key from `from` to `to` inclusive, in order, with no gaps. */
export function enumerateBuckets(from: string, to: string, bucket: RangeBucket): string[] {
  const out: string[] = [];
  let cur = bucketKey(from, bucket);
  const last = bucketKey(to, bucket);
  // Hard cap so a bad input can never spin: ~30 years of daily buckets.
  for (let i = 0; i < 12000 && cur <= last; i++) {
    out.push(cur);
    if (bucket === "day") cur = addDays(cur, 1);
    else if (bucket === "week") cur = addDays(cur, 7);
    else {
      const y = Number(cur.slice(0, 4));
      const m = Number(cur.slice(5, 7));
      cur = utcMsToYmd(Date.UTC(y, m, 1));
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Nov 2026" */
export function formatYmd(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;
}

/** Short axis / table label for a bucket key. */
export function bucketLabel(key: string, bucket: RangeBucket): string {
  if (bucket === "month") return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  if (bucket === "week") return `Week of ${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
  return `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

export type RangeParams = {
  range?: string | string[] | null;
  from?: string | string[] | null;
  to?: string | string[] | null;
};

function first(v: string | string[] | null | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function isRangePreset(v: string | null | undefined): v is RangePreset {
  return !!v && (RANGE_PRESETS as readonly string[]).includes(v);
}

/** Inclusive bounds for a preset relative to `now` (MYT). */
export function presetBounds(preset: RangePreset, now: Date = new Date()): DateRange {
  const today = todayMyt(now);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "this_month":
      return { from: firstOfMonth(today), to: today };
    case "last_month": {
      const prevLast = addDays(firstOfMonth(today), -1);
      return { from: firstOfMonth(prevLast), to: lastOfMonth(prevLast) };
    }
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "all":
      return { from: null, to: null };
  }
}

function build(preset: RangePreset | "custom", range: DateRange): ResolvedRange {
  const days =
    range.from && range.to ? daysBetween(range.from, range.to) : null;
  const { start, endExclusive } = rangeBounds(range);
  let label: string;
  if (preset === "custom") label = `${formatYmd(range.from!)} to ${formatYmd(range.to!)}`;
  else if (preset === "all") label = "All time";
  else if (preset === "today") label = "Today";
  else if (preset === "7d" || preset === "30d" || preset === "90d") label = `Last ${parseInt(preset, 10)} days`;
  else if (preset === "this_month") label = "This month";
  else if (preset === "last_month") label = "Last month";
  else label = "This year";
  return { preset, from: range.from, to: range.to, start, endExclusive, days, bucket: bucketForDays(days), label };
}

/**
 * Turn URL params into a concrete range.
 *   1. valid from+to  -> custom (swapped if from > to)
 *   2. range=<preset> -> that preset (legacy 7d|30d|90d are presets too)
 *   3. otherwise      -> opts.defaultPreset (default "30d")
 * Custom wins over preset when both are present, so a hand-edited URL is
 * predictable. A single valid bound without the other falls to the default.
 */
export function resolveRange(
  params: RangeParams,
  opts: { now?: Date; defaultPreset?: RangePreset } = {},
): ResolvedRange {
  const now = opts.now ?? new Date();
  const fallback = opts.defaultPreset ?? "30d";
  const from = first(params.from);
  const to = first(params.to);
  if (isValidYmd(from) && isValidYmd(to)) {
    const [a, b] = from <= to ? [from, to] : [to, from];
    return build("custom", { from: a, to: b });
  }
  const r = first(params.range);
  const preset = isRangePreset(r) ? r : fallback;
  return build(preset, presetBounds(preset, now));
}

/** Query string fragment that reproduces a resolved range (for export links). */
export function rangeToQuery(r: ResolvedRange): string {
  if (r.preset === "custom") return `from=${r.from}&to=${r.to}`;
  return `range=${r.preset}`;
}
