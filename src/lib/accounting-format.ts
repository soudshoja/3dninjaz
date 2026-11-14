// Small formatting helpers for the accounting entry screens. Pure (no server
// imports) so client components can use them too.

/** Signed MYR with a real minus sign position: "-RM 12.50", "RM 0.00". */
export function fmtMoney(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "RM 0.00";
  const abs = Math.abs(n).toFixed(2);
  const withCommas = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 && Number(abs) !== 0 ? "-" : ""}RM ${withCommas}`;
}

/** Today's date in Malaysia time as YYYY-MM-DD. */
export function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Round to 2 dp, tolerating NaN. */
export function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
