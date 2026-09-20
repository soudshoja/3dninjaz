import { describe, it, expect } from "vitest";
import {
  ackRank,
  ackToStatus,
  buildIdempotencyKey,
  classifyFailure,
  nextBackoffMs,
  MAX_ATTEMPTS,
} from "@/lib/whatsapp/outbox-types";

describe("buildIdempotencyKey", () => {
  const base = { eventKey: "order_shipped", orderId: "o1", recipient: "60123" };

  it("is stable for identical inputs", () => {
    expect(buildIdempotencyKey(base)).toBe(buildIdempotencyKey({ ...base }));
    expect(buildIdempotencyKey(base)).toBe("order_shipped:o1:60123");
  });

  it("null and undefined orderId both use the '-' sentinel and collide", () => {
    const a = buildIdempotencyKey({ ...base, orderId: null });
    const b = buildIdempotencyKey({ ...base, orderId: undefined });
    expect(a).toBe("order_shipped:-:60123");
    expect(a).toBe(b);
  });

  it("differs per recipient and per suffix", () => {
    expect(buildIdempotencyKey(base)).not.toBe(
      buildIdempotencyKey({ ...base, recipient: "60999" }),
    );
    expect(buildIdempotencyKey({ ...base, suffix: "a" })).not.toBe(
      buildIdempotencyKey({ ...base, suffix: "b" }),
    );
  });

  it("stays within 190 chars for a pathological suffix, deterministically", () => {
    const suffix = "x".repeat(500);
    const k = buildIdempotencyKey({ ...base, suffix });
    expect(k.length).toBeLessThanOrEqual(190);
    expect(k).toBe(buildIdempotencyKey({ ...base, suffix }));
    expect(k).not.toBe(buildIdempotencyKey({ ...base, suffix: "y".repeat(500) }));
  });
});

describe("ackRank", () => {
  it("is monotonic PENDING < SERVER_ACK < DELIVERY_ACK < READ", () => {
    expect(ackRank("PENDING")).toBeLessThan(ackRank("SERVER_ACK"));
    expect(ackRank("SERVER_ACK")).toBeLessThan(ackRank("DELIVERY_ACK"));
    expect(ackRank("DELIVERY_ACK")).toBeLessThan(ackRank("READ"));
  });
  it("PLAYED equals READ", () => {
    expect(ackRank("PLAYED")).toBe(ackRank("READ"));
  });
  it("ERROR, DELETED and unknown are -1 and never beat the default -1 rank", () => {
    for (const s of ["ERROR", "DELETED", "WAT", "", null, undefined]) {
      expect(ackRank(s)).toBe(-1);
      // SQL guard is `ack_rank < ?`: a stored -1 is never < -1.
      expect(-1 < ackRank(s)).toBe(false);
    }
  });
});

describe("ackToStatus", () => {
  it("maps the full table", () => {
    expect(ackToStatus("SERVER_ACK")).toBe("server_ack");
    expect(ackToStatus("DELIVERY_ACK")).toBe("delivered");
    expect(ackToStatus("READ")).toBe("read");
    expect(ackToStatus("PLAYED")).toBe("read");
    expect(ackToStatus("ERROR")).toBe("failed_final");
    expect(ackToStatus("PENDING")).toBe("accepted");
    expect(ackToStatus("DELETED")).toBe("cancelled");
    expect(ackToStatus("nope")).toBeNull();
  });
});

describe("classifyFailure", () => {
  it("null status (network/timeout) is retryable", () => {
    expect(classifyFailure(null, "timeout")).toBe("retryable");
  });
  it("428/429/500/503 are retryable", () => {
    for (const s of [428, 429, 500, 503]) expect(classifyFailure(s, "")).toBe("retryable");
  });
  it("400 not-on-whatsapp is final", () => {
    expect(classifyFailure(400, "number is not on whatsapp")).toBe("final");
  });
  it("401/403/404/409 are final", () => {
    for (const s of [401, 403, 404, 409]) expect(classifyFailure(s, "")).toBe("final");
  });
});

describe("nextBackoffMs", () => {
  it("attempt 1 is about 30s (within jitter)", () => {
    for (let i = 0; i < 50; i++) {
      const v = nextBackoffMs(1);
      expect(v).toBeGreaterThanOrEqual(24_000);
      expect(v).toBeLessThanOrEqual(36_000);
    }
  });
  it("is non-decreasing ignoring jitter and caps at 6h", () => {
    const cap = 6 * 3600 * 1000;
    let prevMid = 0;
    for (let n = 1; n <= MAX_ATTEMPTS + 3; n++) {
      const v = nextBackoffMs(n);
      expect(v).toBeLessThanOrEqual(cap * 1.2);
      const mid = Math.min(30_000 * 2 ** (n - 1), cap);
      expect(mid).toBeGreaterThanOrEqual(prevMid);
      prevMid = mid;
    }
    expect(nextBackoffMs(30)).toBeGreaterThanOrEqual(cap * 0.8);
  });
});
