import { describe, it, expect } from "vitest";
import {
  resolveRange,
  presetBounds,
  rangeBounds,
  isValidYmd,
  bucketForDays,
  bucketKey,
  enumerateBuckets,
  mytYmd,
  addDays,
} from "./date-range";

// 2026-11-14 23:30 UTC is already 2026-11-15 07:30 in Malaysia.
const NOW = new Date("2026-11-14T23:30:00Z");

describe("MYT day boundaries", () => {
  it("uses the Malaysia calendar day for 'today'", () => {
    expect(mytYmd(NOW)).toBe("2026-11-15");
    const r = resolveRange({ range: "today" }, { now: NOW });
    expect(r.from).toBe("2026-11-15");
    expect(r.to).toBe("2026-11-15");
  });

  it("maps a day to [00:00+08:00, next 00:00+08:00)", () => {
    const b = rangeBounds({ from: "2026-11-01", to: "2026-11-30" });
    expect(b.start?.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(b.endExclusive?.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });

  it("an order at 23:30 UTC on the 30th belongs to 1 Dec in Malaysia", () => {
    const b = rangeBounds({ from: "2026-11-01", to: "2026-11-30" });
    const order = new Date("2026-11-30T23:30:00Z");
    expect(order < b.endExclusive!).toBe(false);
  });
});

describe("presets", () => {
  it("7d/30d/90d include today", () => {
    expect(presetBounds("7d", NOW)).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(presetBounds("30d", NOW)).toEqual({ from: "2026-10-17", to: "2026-11-15" });
    expect(presetBounds("90d", NOW)).toEqual({ from: "2026-08-18", to: "2026-11-15" });
  });
  it("month and year presets", () => {
    expect(presetBounds("this_month", NOW)).toEqual({ from: "2026-11-01", to: "2026-11-15" });
    expect(presetBounds("last_month", NOW)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetBounds("this_year", NOW)).toEqual({ from: "2026-01-01", to: "2026-11-15" });
    expect(presetBounds("all", NOW)).toEqual({ from: null, to: null });
  });
  it("last_month crosses a year boundary", () => {
    const jan = new Date("2027-01-10T04:00:00Z");
    expect(presetBounds("last_month", jan)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("last_month handles a leap February", () => {
    const mar = new Date("2028-03-05T04:00:00Z");
    expect(presetBounds("last_month", mar)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("resolveRange", () => {
  it("maps legacy ?range=7d", () => {
    const r = resolveRange({ range: "7d" }, { now: NOW });
    expect(r.preset).toBe("7d");
    expect(r.days).toBe(7);
    expect(r.bucket).toBe("day");
  });
  it("accepts custom from/to and swaps when reversed", () => {
    const r = resolveRange({ from: "2026-11-10", to: "2026-11-01" }, { now: NOW });
    expect(r.preset).toBe("custom");
    expect(r.from).toBe("2026-11-01");
    expect(r.to).toBe("2026-11-10");
  });
  it("falls back to the default on junk", () => {
    expect(resolveRange({ range: "banana" }, { now: NOW }).preset).toBe("30d");
    expect(resolveRange({ range: "banana" }, { now: NOW, defaultPreset: "all" }).preset).toBe("all");
    expect(resolveRange({ from: "2026-02-31", to: "2026-03-01" }, { now: NOW }).preset).toBe("30d");
    expect(resolveRange({ from: "2026-11-01" }, { now: NOW, defaultPreset: "this_month" }).preset).toBe("this_month");
  });
  it("custom wins over preset", () => {
    const r = resolveRange({ range: "all", from: "2026-01-01", to: "2026-01-31" }, { now: NOW });
    expect(r.preset).toBe("custom");
  });
  it("'all' is unbounded", () => {
    const r = resolveRange({ range: "all" }, { now: NOW });
    expect(r.start).toBeNull();
    expect(r.endExclusive).toBeNull();
    expect(r.bucket).toBe("month");
  });
});

describe("validation", () => {
  it("rejects impossible dates", () => {
    expect(isValidYmd("2026-02-29")).toBe(false);
    expect(isValidYmd("2028-02-29")).toBe(true);
    expect(isValidYmd("2026-13-01")).toBe(false);
    expect(isValidYmd("26-1-1")).toBe(false);
    expect(isValidYmd(null)).toBe(false);
  });
});

describe("buckets", () => {
  it("picks granularity by span", () => {
    expect(bucketForDays(31)).toBe("day");
    expect(bucketForDays(32)).toBe("week");
    expect(bucketForDays(180)).toBe("week");
    expect(bucketForDays(181)).toBe("month");
    expect(bucketForDays(null)).toBe("month");
  });
  it("week buckets start on Monday", () => {
    // 2026-11-15 is a Sunday; its Monday is 2026-11-09.
    expect(bucketKey("2026-11-15", "week")).toBe("2026-11-09");
    expect(bucketKey("2026-11-09", "week")).toBe("2026-11-09");
    expect(bucketKey("2026-11-20", "month")).toBe("2026-11-01");
  });
  it("enumerates without gaps", () => {
    expect(enumerateBuckets("2026-11-01", "2026-11-03", "day")).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(enumerateBuckets("2026-10-20", "2026-12-02", "month")).toEqual([
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
    ]);
    expect(enumerateBuckets("2026-11-04", "2026-11-23", "week")).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
    ]);
  });
  it("addDays crosses month ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
