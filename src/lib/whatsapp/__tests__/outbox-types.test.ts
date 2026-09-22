import { describe, it, expect } from "vitest";
import {
  ackRank,
  ackToStatus,
  buildIdempotencyKey,
  classifyFailure,
  nextBackoffMs,
  MAX_ATTEMPTS,
  MAX_AGE_SECONDS,
  shouldGiveUp,
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
  it("null status with a non-timeout network error is retryable", () => {
    expect(classifyFailure(null, "connect ECONNREFUSED 127.0.0.1:8080")).toBe("retryable");
    expect(classifyFailure(null, null)).toBe("retryable");
  });
  it("a client timeout is unconfirmed, never auto-retried", () => {
    expect(classifyFailure(null, "timeout")).toBe("unconfirmed");
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

describe("shouldGiveUp (age-based horizon)", () => {
  it("horizon is 48h, longer than the 32.6h outage", () => {
    expect(MAX_AGE_SECONDS).toBe(48 * 3600);
    expect(MAX_AGE_SECONDS).toBeGreaterThan(32.6 * 3600);
  });
  it("keeps retrying while the next attempt lands inside 48h", () => {
    expect(shouldGiveUp({ attempts: 5, ageSeconds: 33 * 3600, delayMs: 3600_000 })).toBeNull();
    expect(shouldGiveUp({ attempts: 5, ageSeconds: 47 * 3600, delayMs: 3600_000 })).toBeNull();
  });
  it("gives up exactly when the next attempt would pass 48h", () => {
    expect(shouldGiveUp({ attempts: 5, ageSeconds: 47 * 3600 + 1, delayMs: 3600_000 })).toBe("max-age");
    expect(shouldGiveUp({ attempts: 5, ageSeconds: 48 * 3600, delayMs: 1 })).toBe("max-age");
  });
  it("attempts ceiling is only a safety valve", () => {
    expect(shouldGiveUp({ attempts: MAX_ATTEMPTS, ageSeconds: 60, delayMs: 30_000 })).toBe("max-attempts");
    expect(shouldGiveUp({ attempts: MAX_ATTEMPTS - 1, ageSeconds: 60, delayMs: 30_000 })).toBeNull();
  });
  it("the capped backoff schedule reaches 48h well before the attempts ceiling", () => {
    let t = 0;
    let n = 0;
    while (t < MAX_AGE_SECONDS) {
      n++;
      t += Math.min(30 * 2 ** (n - 1), 6 * 3600);
    }
    expect(n).toBeLessThan(MAX_ATTEMPTS);
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
